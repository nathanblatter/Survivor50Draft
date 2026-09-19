import { Router, Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../middleware/auth';
import crypto from 'crypto';

const router = Router();

function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('hex');
}

const LEAGUE_SELECT = `
  SELECT l.*, s.season_number, s.name as season_name, s.cast_count, s.is_complete as season_complete,
    s.current_episode, sh.name as show_name, sh.slug as show_slug,
    (SELECT COUNT(*)::int FROM teams t WHERE t.league_id = l.id) as team_count
  FROM leagues l
  JOIN seasons s ON s.id = l.season_id
  JOIN shows sh ON sh.id = s.show_id
`;

// List leagues for a season
router.get('/seasons/:seasonId/leagues', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`${LEAGUE_SELECT} WHERE l.season_id = $1 ORDER BY l.id`, [req.params.seasonId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch leagues' });
  }
});

// Create league for a season
router.post('/seasons/:seasonId/leagues', authMiddleware, async (req: Request, res: Response) => {
  const { seasonId } = req.params;
  const { name, invite_code } = req.body;
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const seasonCheck = await pool.query('SELECT id FROM seasons WHERE id = $1', [seasonId]);
  if (seasonCheck.rows.length === 0) {
    res.status(404).json({ error: 'Season not found' });
    return;
  }
  const code = (invite_code || generateInviteCode()).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'INSERT INTO leagues (season_id, name, invite_code) VALUES ($1, $2, $3) RETURNING *',
      [seasonId, name, code]
    );
    await client.query(
      'INSERT INTO draft_state (league_id, is_active, is_complete, current_pick) VALUES ($1, false, false, 1)',
      [result.rows[0].id]
    );
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      res.status(409).json({ error: 'That invite code is already taken' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create league' });
  } finally {
    client.release();
  }
});

// Get league by ID
router.get('/leagues/:leagueId(\\d+)', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`${LEAGUE_SELECT} WHERE l.id = $1`, [req.params.leagueId]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'League not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch league' });
  }
});

// Look up league by invite code
router.get('/leagues/join/:inviteCode', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`${LEAGUE_SELECT} WHERE l.invite_code = $1`, [req.params.inviteCode]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'League not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch league' });
  }
});

// Update league
router.patch('/leagues/:leagueId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Provide name to update' });
      return;
    }
    const result = await pool.query('UPDATE leagues SET name = $1 WHERE id = $2 RETURNING *', [name, req.params.leagueId]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'League not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update league' });
  }
});

// Delete league
router.delete('/leagues/:leagueId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM leagues WHERE id = $1 RETURNING *', [req.params.leagueId]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'League not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete league' });
  }
});

export default router;
