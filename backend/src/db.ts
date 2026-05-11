import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const isRemote = (process.env.DATABASE_URL || '').includes('rds.amazonaws.com');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/survivor50',
  ...(isRemote && { ssl: { rejectUnauthorized: false } }),
});

export default pool;

export async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- Multi-show/multi-league hierarchy
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
        original_seasons VARCHAR(200) NOT NULL,
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
    `);

    // Migrate existing tribe_history: replace tribe_name with tribe_id
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tribe_history' AND column_name='tribe_name'
        ) THEN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='tribe_history' AND column_name='tribe_id'
          ) THEN
            ALTER TABLE tribe_history ADD COLUMN tribe_id INTEGER REFERENCES tribes(id) ON DELETE CASCADE;
          END IF;
          UPDATE tribe_history th
          SET tribe_id = t.id
          FROM tribes t
          WHERE t.name = th.tribe_name
            AND th.tribe_id IS NULL;
          ALTER TABLE tribe_history DROP COLUMN tribe_name;
        END IF;
      END$$;
    `);
    console.log('Database tables initialized');
  } finally {
    client.release();
  }
}
