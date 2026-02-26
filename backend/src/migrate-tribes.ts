import dotenv from 'dotenv';
dotenv.config();

import pool, { initDB } from './db';

const ORIGINAL_TRIBES = [
  { name: 'Cila', color: '#E87830' },
  { name: 'Kalo', color: '#4AC8D9' },
  { name: 'Vatu', color: '#D06CC0' },
];

async function migrate() {
  // Ensure tables exist
  await initDB();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert original tribes (skip if already exist)
    for (const tribe of ORIGINAL_TRIBES) {
      const exists = await client.query('SELECT id FROM tribes WHERE name = $1', [tribe.name]);
      if (exists.rows.length === 0) {
        await client.query(
          'INSERT INTO tribes (name, color, phase, introduced_episode) VALUES ($1, $2, $3, $4)',
          [tribe.name, tribe.color, 'original', 1]
        );
        console.log(`  Created tribe: ${tribe.name}`);
      } else {
        console.log(`  Tribe already exists: ${tribe.name}`);
      }
    }

    // Backfill tribe_history from current player data
    const players = await client.query('SELECT id, name, tribe FROM players');
    for (const p of players.rows) {
      const historyExists = await client.query(
        'SELECT id FROM tribe_history WHERE player_id = $1',
        [p.id]
      );
      if (historyExists.rows.length === 0) {
        await client.query(
          'INSERT INTO tribe_history (player_id, tribe_name, phase, episode) VALUES ($1, $2, $3, $4)',
          [p.id, p.tribe, 'original', 1]
        );
        console.log(`  Added tribe history for ${p.name}: ${p.tribe}`);
      } else {
        console.log(`  Tribe history already exists for ${p.name}`);
      }
    }

    await client.query('COMMIT');
    console.log('\nMigration complete!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
