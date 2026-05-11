import { Router, Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../middleware/auth';
import crypto from 'crypto';

const router = Router();

function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('hex');
}

// List leagues for a season
router.get('/seasons/:seasonId/leagues', async (req: Request, res: Response) => {
  try {
    const { seasonId } = req.params;
    const result = await pool.query(`
      SELECT l.*,
        (SELECT COUNT(*) FROM teams t WHERE t.league_id = l.id) as team_count
      FROM leagues l
      WHERE l.season_id = $1
      ORDER BY l.created_at DESC
    `, [seasonId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch leagues' });
  }
});

// Create league for a season
router.post('/seasons/:seasonId/leagues', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { seasonId } = req.params;
    const { name, invite_code } = req.body;
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    // Verify season exists
    const seasonCheck = await pool.query('SELECT id FROM seasons WHERE id = $1', [seasonId]);
    if (seasonCheck.rows.length === 0) {
      res.status(404).json({ error: 'Season not found' });
      return;
    }

    const code = invite_code || generateInviteCode();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        'INSERT INTO leagues (season_id, name, invite_code) VALUES ($1, $2, $3) RETURNING *',
        [seasonId, name, code]
      );
      const leagueId = result.rows[0].id;

      // Initialize draft state for the new league
      await client.query(
        'INSERT INTO draft_state (league_id, is_active, is_complete, current_pick) VALUES ($1, false, false, 1)',
        [leagueId]
      );

      await client.query('COMMIT');
      res.status(201).json(result.rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'That invite code is already taken' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create league' });
  }
});

// Get league by ID
router.get('/leagues/:leagueId', async (req: Request, res: Response) => {
  try {
    const { leagueId } = req.params;
    const result = await pool.query(`
      SELECT l.*, s.season_number, s.name as season_name, s.cast_count,
        sh.name as show_name, sh.slug as show_slug
      FROM leagues l
      JOIN seasons s ON s.id = l.season_id
      JOIN shows sh ON sh.id = s.show_id
      WHERE l.id = $1
    `, [leagueId]);
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
    const { inviteCode } = req.params;
    const result = await pool.query(`
      SELECT l.*, s.season_number, s.name as season_name, s.cast_count, s.id as season_id,
        sh.name as show_name, sh.slug as show_slug
      FROM leagues l
      JOIN seasons s ON s.id = l.season_id
      JOIN shows sh ON sh.id = s.show_id
      WHERE l.invite_code = $1
    `, [inviteCode]);
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
    const { leagueId } = req.params;
    const { name } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Provide name to update' });
      return;
    }
    const result = await pool.query(
      'UPDATE leagues SET name = $1 WHERE id = $2 RETURNING *',
      [name, leagueId]
    );
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
    const { leagueId } = req.params;
    const result = await pool.query('DELETE FROM leagues WHERE id = $1 RETURNING *', [leagueId]);
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
