/**
 * Non-destructive season seeder.
 *
 *   npm run seed -- survivor-51
 *
 * Upserts the show and season, adds missing tribes and scoring rules, inserts the cast only
 * if the season has no players yet, and creates the default league if missing.
 * It never deletes anything, so it's safe to run against a live database.
 */
import pool, { initDB } from './db';
import dotenv from 'dotenv';
import { SeasonSeed } from './seasons/types';

dotenv.config();

async function seed(seasonSlug: string) {
  let data: SeasonSeed;
  try {
    data = (await import(`./seasons/${seasonSlug}`)).default;
  } catch {
    console.error(`Unknown season "${seasonSlug}". Add backend/src/seasons/${seasonSlug}.ts first.`);
    process.exit(1);
  }

  await initDB();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const showRes = await client.query(
      `INSERT INTO shows (name, slug, description) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = COALESCE(shows.description, EXCLUDED.description)
       RETURNING id`,
      [data.show.name, data.show.slug, data.show.description || null]
    );
    const showId = showRes.rows[0].id;

    const seasonRes = await client.query(
      `INSERT INTO seasons (show_id, season_number, name, cast_count, is_active, premiere_date)
       VALUES ($1, $2, $3, $4, true, $5)
       ON CONFLICT (show_id, season_number) DO UPDATE
         SET name = COALESCE(seasons.name, EXCLUDED.name),
             premiere_date = COALESCE(seasons.premiere_date, EXCLUDED.premiere_date)
       RETURNING id`,
      [showId, data.season.number, data.season.name || null, data.players.length, data.season.premiere_date || null]
    );
    const seasonId = seasonRes.rows[0].id;
    console.log(`${data.show.name} ${data.season.number}: season id ${seasonId}`);

    const tribeIds: Record<string, number> = {};
    for (const tribe of data.tribes) {
      const r = await client.query(
        `INSERT INTO tribes (season_id, name, color, phase, introduced_episode) VALUES ($1, $2, $3, 'original', 1)
         ON CONFLICT (season_id, name) DO UPDATE SET color = EXCLUDED.color RETURNING id`,
        [seasonId, tribe.name, tribe.color]
      );
      tribeIds[tribe.name] = r.rows[0].id;
    }
    console.log(`Tribes ready: ${data.tribes.map((t) => t.name).join(', ')}`);

    const existing = await client.query('SELECT COUNT(*)::int as n FROM players WHERE season_id = $1', [seasonId]);
    if (existing.rows[0].n > 0) {
      console.log(`Season already has ${existing.rows[0].n} players — skipping cast insert`);
    } else {
      for (const p of data.players) {
        const r = await client.query(
          `INSERT INTO players (season_id, name, nickname, original_seasons, tribe, photo_url, occupation, hometown)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [seasonId, p.name, p.nickname || null, p.original_seasons || '', p.tribe, p.photo_url || null, p.occupation || null, p.hometown || null]
        );
        if (tribeIds[p.tribe]) {
          await client.query(
            'INSERT INTO tribe_history (player_id, tribe_id, phase, episode) VALUES ($1, $2, $3, $4)',
            [r.rows[0].id, tribeIds[p.tribe], 'original', 1]
          );
        }
      }
      await client.query('UPDATE seasons SET cast_count = $1 WHERE id = $2', [data.players.length, seasonId]);
      console.log(`Inserted ${data.players.length} players`);
    }

    if (data.scoringRules) {
      const rules = await client.query('SELECT COUNT(*)::int as n FROM scoring_rules WHERE show_id = $1', [showId]);
      if (rules.rows[0].n === 0) {
        for (const rule of data.scoringRules) {
          await client.query(
            'INSERT INTO scoring_rules (show_id, event_type, points, description, is_variable) VALUES ($1, $2, $3, $4, $5)',
            [showId, rule.eventType, rule.points, rule.description, rule.isVariable || false]
          );
        }
        console.log(`Inserted ${data.scoringRules.length} scoring rules`);
      } else {
        console.log(`Show already has ${rules.rows[0].n} scoring rules — leaving them alone`);
      }
    }

    if (data.league) {
      const league = await client.query('SELECT id FROM leagues WHERE invite_code = $1', [data.league.invite_code]);
      if (league.rows.length === 0) {
        const r = await client.query(
          'INSERT INTO leagues (season_id, name, invite_code) VALUES ($1, $2, $3) RETURNING id',
          [seasonId, data.league.name, data.league.invite_code]
        );
        await client.query(
          'INSERT INTO draft_state (league_id, is_active, is_complete, current_pick) VALUES ($1, false, false, 1)',
          [r.rows[0].id]
        );
        console.log(`Created league "${data.league.name}" (invite code ${data.league.invite_code})`);
      } else {
        console.log(`League "${data.league.invite_code}" already exists`);
      }
    }

    await client.query('COMMIT');
    console.log('Seed complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed (rolled back):', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: npm run seed -- <season-slug>   e.g. npm run seed -- survivor-51');
  process.exit(1);
}
seed(slug);
