import pool from './db';
import dotenv from 'dotenv';

dotenv.config();

async function migrateMulti() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Starting multi-show/multi-league migration...');

    // 1. Create shows table
    await client.query(`
      CREATE TABLE IF NOT EXISTS shows (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(50) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Created shows table');

    // 2. Create seasons table
    await client.query(`
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
    `);
    console.log('Created seasons table');

    // 3. Create leagues table
    await client.query(`
      CREATE TABLE IF NOT EXISTS leagues (
        id SERIAL PRIMARY KEY,
        season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        invite_code VARCHAR(50) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Created leagues table');

    // 4. Insert Survivor show
    const showResult = await client.query(`
      INSERT INTO shows (name, slug, description)
      VALUES ('Survivor', 'survivor', 'The original reality competition')
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `);
    const showId = showResult.rows[0].id;
    console.log(`Survivor show id: ${showId}`);

    // 5. Count existing players for cast_count
    const playerCountResult = await client.query('SELECT COUNT(*) FROM players');
    const castCount = parseInt(playerCountResult.rows[0].count) || 24;

    // 6. Insert Season 50
    const seasonResult = await client.query(`
      INSERT INTO seasons (show_id, season_number, name, cast_count, is_active)
      VALUES ($1, 50, 'In the Hands of the Fans', $2, true)
      ON CONFLICT (show_id, season_number) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `, [showId, castCount]);
    const seasonId = seasonResult.rows[0].id;
    console.log(`Season 50 id: ${seasonId}`);

    // 7. Insert default league for existing teams
    const leagueResult = await client.query(`
      INSERT INTO leagues (season_id, name, invite_code)
      VALUES ($1, 'Original League', 'og-league')
      ON CONFLICT (invite_code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `, [seasonId]);
    const leagueId = leagueResult.rows[0].id;
    console.log(`Default league id: ${leagueId}`);

    // 8. Add season_id to players
    const hasPlayerSeasonId = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'players' AND column_name = 'season_id'
    `);
    if (hasPlayerSeasonId.rows.length === 0) {
      await client.query('ALTER TABLE players ADD COLUMN season_id INTEGER REFERENCES seasons(id)');
      await client.query('UPDATE players SET season_id = $1', [seasonId]);
      await client.query('ALTER TABLE players ALTER COLUMN season_id SET NOT NULL');
      console.log('Added season_id to players');
    }

    // 9. Add season_id to tribes
    const hasTribeSeasonId = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'tribes' AND column_name = 'season_id'
    `);
    if (hasTribeSeasonId.rows.length === 0) {
      await client.query('ALTER TABLE tribes ADD COLUMN season_id INTEGER REFERENCES seasons(id)');
      await client.query('UPDATE tribes SET season_id = $1', [seasonId]);
      await client.query('ALTER TABLE tribes ALTER COLUMN season_id SET NOT NULL');
      // Update unique constraint: drop old, add new
      await client.query('ALTER TABLE tribes DROP CONSTRAINT IF EXISTS tribes_name_key');
      await client.query('ALTER TABLE tribes ADD CONSTRAINT tribes_season_name_unique UNIQUE(season_id, name)');
      console.log('Added season_id to tribes');
    }

    // 10. Add show_id to scoring_rules
    const hasRuleShowId = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'scoring_rules' AND column_name = 'show_id'
    `);
    if (hasRuleShowId.rows.length === 0) {
      await client.query('ALTER TABLE scoring_rules ADD COLUMN show_id INTEGER REFERENCES shows(id)');
      await client.query('UPDATE scoring_rules SET show_id = $1', [showId]);
      await client.query('ALTER TABLE scoring_rules ALTER COLUMN show_id SET NOT NULL');
      // Update unique constraint
      await client.query('ALTER TABLE scoring_rules DROP CONSTRAINT IF EXISTS scoring_rules_event_type_key');
      await client.query('ALTER TABLE scoring_rules ADD CONSTRAINT scoring_rules_show_event_unique UNIQUE(show_id, event_type)');
      console.log('Added show_id to scoring_rules');
    }

    // 11. Add league_id to teams
    const hasTeamLeagueId = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'teams' AND column_name = 'league_id'
    `);
    if (hasTeamLeagueId.rows.length === 0) {
      await client.query('ALTER TABLE teams ADD COLUMN league_id INTEGER REFERENCES leagues(id)');
      await client.query('UPDATE teams SET league_id = $1', [leagueId]);
      await client.query('ALTER TABLE teams ALTER COLUMN league_id SET NOT NULL');
      console.log('Added league_id to teams');
    }

    // 12. Add league_id to draft_state
    const hasDraftLeagueId = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'draft_state' AND column_name = 'league_id'
    `);
    if (hasDraftLeagueId.rows.length === 0) {
      await client.query('ALTER TABLE draft_state ADD COLUMN league_id INTEGER REFERENCES leagues(id) UNIQUE');
      await client.query('UPDATE draft_state SET league_id = $1', [leagueId]);
      await client.query('ALTER TABLE draft_state ALTER COLUMN league_id SET NOT NULL');
      console.log('Added league_id to draft_state');
    }

    // 13. Add season_id to game_idols
    const hasIdolSeasonId = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'game_idols' AND column_name = 'season_id'
    `);
    if (hasIdolSeasonId.rows.length === 0) {
      await client.query('ALTER TABLE game_idols ADD COLUMN season_id INTEGER REFERENCES seasons(id)');
      await client.query('UPDATE game_idols SET season_id = $1', [seasonId]);
      await client.query('ALTER TABLE game_idols ALTER COLUMN season_id SET NOT NULL');
      console.log('Added season_id to game_idols');
    }

    // 14. Add season_id to game_advantages
    const hasAdvSeasonId = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'game_advantages' AND column_name = 'season_id'
    `);
    if (hasAdvSeasonId.rows.length === 0) {
      await client.query('ALTER TABLE game_advantages ADD COLUMN season_id INTEGER REFERENCES seasons(id)');
      await client.query('UPDATE game_advantages SET season_id = $1', [seasonId]);
      await client.query('ALTER TABLE game_advantages ALTER COLUMN season_id SET NOT NULL');
      console.log('Added season_id to game_advantages');
    }

    // 15. Add season_id to alliances
    const hasAllianceSeasonId = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'alliances' AND column_name = 'season_id'
    `);
    if (hasAllianceSeasonId.rows.length === 0) {
      await client.query('ALTER TABLE alliances ADD COLUMN season_id INTEGER REFERENCES seasons(id)');
      await client.query('UPDATE alliances SET season_id = $1', [seasonId]);
      await client.query('ALTER TABLE alliances ALTER COLUMN season_id SET NOT NULL');
      console.log('Added season_id to alliances');
    }

    // 16. Update team_players: drop UNIQUE(player_id) for multi-league support
    // A player can now be on different teams in different leagues
    await client.query('ALTER TABLE team_players DROP CONSTRAINT IF EXISTS team_players_player_id_key');
    console.log('Dropped global UNIQUE(player_id) from team_players');

    await client.query('COMMIT');
    console.log('\nMigration complete! All Survivor 50 data preserved.');
    console.log(`  Show: Survivor (id=${showId})`);
    console.log(`  Season: 50 (id=${seasonId}, cast_count=${castCount})`);
    console.log(`  League: Original League (id=${leagueId}, invite_code=og-league)`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed (rolled back):', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrateMulti();
