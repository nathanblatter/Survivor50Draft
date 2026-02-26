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
      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        nickname VARCHAR(50),
        original_seasons VARCHAR(200) NOT NULL,
        tribe VARCHAR(50) NOT NULL,
        photo_url TEXT,
        is_eliminated BOOLEAN DEFAULT FALSE,
        placement INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
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
        drafted_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(player_id)
      );

      CREATE TABLE IF NOT EXISTS scoring_rules (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL UNIQUE,
        points DECIMAL(10,2) NOT NULL,
        description TEXT NOT NULL,
        is_variable BOOLEAN DEFAULT FALSE
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

      CREATE TABLE IF NOT EXISTS draft_state (
        id SERIAL PRIMARY KEY,
        is_active BOOLEAN DEFAULT FALSE,
        is_complete BOOLEAN DEFAULT FALSE,
        current_pick INTEGER DEFAULT 1,
        snake_draft BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tribes (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        color VARCHAR(7) NOT NULL,
        phase VARCHAR(20) NOT NULL DEFAULT 'original',
        introduced_episode INTEGER,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tribe_history (
        id SERIAL PRIMARY KEY,
        player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
        tribe_name VARCHAR(50) NOT NULL,
        phase VARCHAR(20) NOT NULL,
        episode INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Database tables initialized');
  } finally {
    client.release();
  }
}
