import { Router, Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT p.*, tp.team_id,
        COALESCE(
          (SELECT SUM(se.points) FROM scoring_events se WHERE se.player_id = p.id), 0
        ) as total_points,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'tribe_name', th.tribe_name,
            'phase', th.phase,
            'episode', th.episode
          ) ORDER BY th.id) FROM tribe_history th WHERE th.player_id = p.id),
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

export default router;
