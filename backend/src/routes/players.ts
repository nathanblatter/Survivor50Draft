import { Router, Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ── Scoped: GET /api/seasons/:seasonId/players ──
router.get('/seasons/:seasonId/players', async (req: Request, res: Response) => {
  try {
    const { seasonId } = req.params;
    const result = await pool.query(`
      SELECT p.*, tp.team_id,
        COALESCE(
          (SELECT SUM(se.points) FROM scoring_events se WHERE se.player_id = p.id), 0
        ) as total_points,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'tribe_name', t.name,
            'phase', th.phase,
            'episode', th.episode
          ) ORDER BY th.id) FROM tribe_history th JOIN tribes t ON t.id = th.tribe_id WHERE th.player_id = p.id),
          '[]'::json
        ) as tribe_history
      FROM players p
      LEFT JOIN team_players tp ON tp.player_id = p.id
      WHERE p.season_id = $1
      ORDER BY p.tribe, p.name
    `, [seasonId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// ── Scoped: POST /api/seasons/:seasonId/players — add single player ──
router.post('/seasons/:seasonId/players', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { seasonId } = req.params;
    const { name, nickname, original_seasons, tribe, photo_url } = req.body;
    if (!name || !original_seasons || !tribe) {
      res.status(400).json({ error: 'name, original_seasons, and tribe are required' });
      return;
    }
    const result = await pool.query(
      'INSERT INTO players (season_id, name, nickname, original_seasons, tribe, photo_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [seasonId, name, nickname || null, original_seasons, tribe, photo_url || null]
    );

    // Update season cast_count
    await pool.query(
      'UPDATE seasons SET cast_count = (SELECT COUNT(*) FROM players WHERE season_id = $1) WHERE id = $1',
      [seasonId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create player' });
  }
});

// ── Scoped: POST /api/seasons/:seasonId/players/bulk — bulk import ──
router.post('/seasons/:seasonId/players/bulk', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { seasonId } = req.params;
    const { players } = req.body;
    if (!players || !Array.isArray(players) || players.length === 0) {
      res.status(400).json({ error: 'players array is required' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = [];
      for (const p of players) {
        if (!p.name || !p.tribe) {
          await client.query('ROLLBACK');
          res.status(400).json({ error: `Each player needs name and tribe. Missing for: ${JSON.stringify(p)}` });
          return;
        }
        const result = await client.query(
          'INSERT INTO players (season_id, name, nickname, original_seasons, tribe, photo_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [seasonId, p.name, p.nickname || null, p.original_seasons || '', p.tribe, p.photo_url || null]
        );
        inserted.push(result.rows[0]);
      }

      // Update season cast_count
      await client.query(
        'UPDATE seasons SET cast_count = (SELECT COUNT(*) FROM players WHERE season_id = $1) WHERE id = $1',
        [seasonId]
      );

      await client.query('COMMIT');
      res.status(201).json(inserted);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk import players' });
  }
});

// ── Legacy: GET /api/players (returns all players, backward compat) ──
router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT p.*, tp.team_id,
        COALESCE(
          (SELECT SUM(se.points) FROM scoring_events se WHERE se.player_id = p.id), 0
        ) as total_points,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'tribe_name', t.name,
            'phase', th.phase,
            'episode', th.episode
          ) ORDER BY th.id) FROM tribe_history th JOIN tribes t ON t.id = th.tribe_id WHERE th.player_id = p.id),
          '[]'::json
        ) as tribe_history
      FROM players p
      LEFT JOIN team_players tp ON tp.player_id = p.id
      ORDER BY p.tribe, p.name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// ── GET /api/players/:id — global (player ID is unique) ──
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const playerResult = await pool.query(`
      SELECT p.*, tp.team_id,
        COALESCE(
          (SELECT SUM(se.points) FROM scoring_events se WHERE se.player_id = p.id), 0
        ) as total_points
      FROM players p
      LEFT JOIN team_players tp ON tp.player_id = p.id
      WHERE p.id = $1
    `, [id]);

    if (playerResult.rows.length === 0) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const eventsResult = await pool.query(
      'SELECT * FROM scoring_events WHERE player_id = $1 ORDER BY created_at DESC',
      [id]
    );

    res.json({ ...playerResult.rows[0], events: eventsResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch player' });
  }
});

// ── PATCH /api/players/:id — global ──
router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_eliminated, placement, photo_url } = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (is_eliminated !== undefined) { fields.push(`is_eliminated = $${idx++}`); values.push(is_eliminated); }
    if (placement !== undefined) { fields.push(`placement = $${idx++}`); values.push(placement); }
    if (photo_url !== undefined) { fields.push(`photo_url = $${idx++}`); values.push(photo_url); }

    if (fields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE players SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update player' });
  }
});

// ── DELETE /api/players/:id — global ──
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM players WHERE id = $1', [id]);

    // Update season cast_count
    const playerResult = await pool.query('SELECT season_id FROM players WHERE id = $1', [id]);
    if (playerResult.rows.length > 0) {
      const seasonId = playerResult.rows[0].season_id;
      await pool.query(
        'UPDATE seasons SET cast_count = (SELECT COUNT(*) FROM players WHERE season_id = $1) WHERE id = $1',
        [seasonId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete player' });
  }
});

export default router;
