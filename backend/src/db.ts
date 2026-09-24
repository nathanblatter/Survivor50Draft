import { Pool, types } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Return DATE columns as plain YYYY-MM-DD strings instead of timezone-shifted Date objects.
types.setTypeParser(1082, (v: string) => v);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/survivor50',
});

export default pool;

export async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- Show → Season → League hierarchy
      CREATE TABLE IF NOT EXISTS shows (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(50) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS seasons (
        id SERIAL PRIMARY KEY,
        show_id INTEGER NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
        season_number INTEGER NOT NULL,
        name VARCHAR(200),
        cast_count INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(show_id, season_number)
      );

      CREATE TABLE IF NOT EXISTS leagues (
        id SERIAL PRIMARY KEY,
        season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        invite_code VARCHAR(50) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Season-scoped tables
      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        nickname VARCHAR(50),
        original_seasons VARCHAR(200) NOT NULL DEFAULT '',
        tribe VARCHAR(50) NOT NULL,
        photo_url TEXT,
        is_eliminated BOOLEAN DEFAULT FALSE,
        placement INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tribes (
        id SERIAL PRIMARY KEY,
        season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        name VARCHAR(50) NOT NULL,
        color VARCHAR(7) NOT NULL,
        phase VARCHAR(20) NOT NULL DEFAULT 'original',
        introduced_episode INTEGER,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(season_id, name)
      );

      CREATE TABLE IF NOT EXISTS tribe_history (
        id SERIAL PRIMARY KEY,
        player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
        tribe_id INTEGER REFERENCES tribes(id) ON DELETE CASCADE,
        phase VARCHAR(20) NOT NULL,
        episode INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Show-scoped scoring rules
      CREATE TABLE IF NOT EXISTS scoring_rules (
        id SERIAL PRIMARY KEY,
        show_id INTEGER NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL,
        points DECIMAL(10,2) NOT NULL,
        description TEXT NOT NULL,
        is_variable BOOLEAN DEFAULT FALSE,
        UNIQUE(show_id, event_type)
      );

      CREATE TABLE IF NOT EXISTS scoring_events (
        id SERIAL PRIMARY KEY,
        player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL,
        points DECIMAL(10,2) NOT NULL,
        episode INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- League-scoped tables
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        owner_name VARCHAR(100) NOT NULL,
        draft_order INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS team_players (
        id SERIAL PRIMARY KEY,
        team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
        player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
        pick_number INTEGER,
        drafted_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS draft_state (
        id SERIAL PRIMARY KEY,
        league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE UNIQUE,
        is_active BOOLEAN DEFAULT FALSE,
        is_complete BOOLEAN DEFAULT FALSE,
        current_pick INTEGER DEFAULT 1,
        snake_draft BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Season-scoped game state
      CREATE TABLE IF NOT EXISTS game_idols (
        id SERIAL PRIMARY KEY,
        season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
        label VARCHAR(100) DEFAULT 'Hidden Immunity Idol',
        found_episode INTEGER,
        played_episode INTEGER,
        is_active BOOLEAN DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS game_advantages (
        id SERIAL PRIMARY KEY,
        season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
        advantage_type VARCHAR(100) NOT NULL,
        found_episode INTEGER,
        played_episode INTEGER,
        is_active BOOLEAN DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS alliances (
        id SERIAL PRIMARY KEY,
        season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        formed_episode INTEGER,
        is_active BOOLEAN DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS alliance_members (
        id SERIAL PRIMARY KEY,
        alliance_id INTEGER REFERENCES alliances(id) ON DELETE CASCADE,
        player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
        UNIQUE(alliance_id, player_id)
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INT,
        logged_in_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Cached AI end-of-season recaps (one per team)
      CREATE TABLE IF NOT EXISTS team_recaps (
        team_id INTEGER PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
        recap TEXT NOT NULL,
        generated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Additive migrations (safe to re-run)
    await client.query(`
      ALTER TABLE seasons ADD COLUMN IF NOT EXISTS current_episode_aired_at TIMESTAMPTZ;
      ALTER TABLE seasons ADD COLUMN IF NOT EXISTS current_episode INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE seasons ADD COLUMN IF NOT EXISTS is_complete BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE seasons ADD COLUMN IF NOT EXISTS premiere_date DATE;
      ALTER TABLE players ADD COLUMN IF NOT EXISTS occupation VARCHAR(120);
      ALTER TABLE players ADD COLUMN IF NOT EXISTS hometown VARCHAR(120);
      ALTER TABLE players ALTER COLUMN original_seasons SET DEFAULT '';
      CREATE INDEX IF NOT EXISTS idx_scoring_events_player ON scoring_events(player_id);
      CREATE INDEX IF NOT EXISTS idx_scoring_events_episode ON scoring_events(episode);
      CREATE INDEX IF NOT EXISTS idx_team_players_player ON team_players(player_id);
      ALTER TABLE leagues ADD COLUMN IF NOT EXISTS roster_size INTEGER;
      ALTER TABLE draft_state ADD COLUMN IF NOT EXISTS pick_deadline TIMESTAMPTZ;
      ALTER TABLE draft_state ADD COLUMN IF NOT EXISTS seconds_per_pick INTEGER;
      ALTER TABLE scoring_events ADD COLUMN IF NOT EXISTS is_neutral BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    // Older databases created these FKs without ON DELETE CASCADE; deleting a season/league needs it.
    const cascade: [string, string, string, string][] = [
      ['players', 'players_season_id_fkey', 'season_id', 'seasons'],
      ['tribes', 'tribes_season_id_fkey', 'season_id', 'seasons'],
      ['game_idols', 'game_idols_season_id_fkey', 'season_id', 'seasons'],
      ['game_advantages', 'game_advantages_season_id_fkey', 'season_id', 'seasons'],
      ['alliances', 'alliances_season_id_fkey', 'season_id', 'seasons'],
      ['scoring_rules', 'scoring_rules_show_id_fkey', 'show_id', 'shows'],
      ['teams', 'teams_league_id_fkey', 'league_id', 'leagues'],
      ['draft_state', 'draft_state_league_id_fkey', 'league_id', 'leagues'],
    ];
    for (const [table, con, col, ref] of cascade) {
      const r = await client.query(
        `SELECT confdeltype FROM pg_constraint WHERE conname = $1 AND conrelid = $2::regclass`,
        [con, table]
      );
      if (r.rows.length && r.rows[0].confdeltype !== 'c') {
        await client.query(`ALTER TABLE ${table} DROP CONSTRAINT ${con}`);
        await client.query(`ALTER TABLE ${table} ADD CONSTRAINT ${con} FOREIGN KEY (${col}) REFERENCES ${ref}(id) ON DELETE CASCADE`);
        console.log(`Migrated ${con} to ON DELETE CASCADE`);
      }
    }

    console.log('Database tables initialized');
  } finally {
    client.release();
  }
}
