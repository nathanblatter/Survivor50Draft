import { Router, Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ── Scoped: GET /api/shows/:showSlug/rules ──
router.get('/shows/:showSlug/rules', async (req: Request, res: Response) => {
  try {
    const { showSlug } = req.params;
    const showResult = await pool.query('SELECT id FROM shows WHERE slug = $1', [showSlug]);
    if (showResult.rows.length === 0) {
      res.status(404).json({ error: 'Show not found' });
      return;
    }
    const result = await pool.query(
      'SELECT * FROM scoring_rules WHERE show_id = $1 ORDER BY id',
      [showResult.rows[0].id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch scoring rules' });
  }
});

// ── Scoped: POST /api/shows/:showSlug/rules ──
router.post('/shows/:showSlug/rules', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { showSlug } = req.params;
    const { event_type, points, description, is_variable } = req.body;
    if (!event_type || points === undefined || !description) {
      res.status(400).json({ error: 'event_type, points, and description are required' });
      return;
    }
    const showResult = await pool.query('SELECT id FROM shows WHERE slug = $1', [showSlug]);
    if (showResult.rows.length === 0) {
      res.status(404).json({ error: 'Show not found' });
      return;
    }
    const result = await pool.query(
      'INSERT INTO scoring_rules (show_id, event_type, points, description, is_variable) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [showResult.rows[0].id, event_type, points, description, is_variable || false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(400).json({ error: 'A rule with that event type already exists for this show' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create scoring rule' });
  }
});

// ── Scoped: GET /api/seasons/:seasonId/scoring/events ──
router.get('/seasons/:seasonId/scoring/events', async (req: Request, res: Response) => {
  try {
    const { seasonId } = req.params;
    const { limit = 50 } = req.query;
    const result = await pool.query(`
      SELECT se.*, p.name as player_name, p.tribe
      FROM scoring_events se
      JOIN players p ON p.id = se.player_id
      WHERE p.season_id = $1
      ORDER BY se.created_at DESC
      LIMIT $2
    `, [seasonId, limit]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch scoring events' });
  }
});

// ── Legacy: GET /api/scoring/rules ──
router.get('/rules', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM scoring_rules ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch scoring rules' });
  }
});

// ── POST /api/scoring/rules (legacy, uses first show) ──
router.post('/rules', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { event_type, points, description, is_variable, show_id } = req.body;
    if (!event_type || points === undefined || !description) {
      res.status(400).json({ error: 'event_type, points, and description are required' });
      return;
    }
    let sid = show_id;
    if (!sid) {
      const defaultShow = await pool.query('SELECT id FROM shows ORDER BY id LIMIT 1');
      sid = defaultShow.rows[0]?.id;
    }
    const result = await pool.query(
      'INSERT INTO scoring_rules (show_id, event_type, points, description, is_variable) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [sid, event_type, points, description, is_variable || false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(400).json({ error: 'A rule with that event type already exists' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create scoring rule' });
  }
});

router.patch('/rules/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { event_type, points, description, is_variable } = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (event_type !== undefined) { fields.push(`event_type = $${idx++}`); values.push(event_type); }
    if (points !== undefined) { fields.push(`points = $${idx++}`); values.push(points); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (is_variable !== undefined) { fields.push(`is_variable = $${idx++}`); values.push(is_variable); }
    if (fields.length === 0) {
      res.status(400).json({ error: 'Provide at least one field to update' });
      return;
    }
    values.push(id);
    const result = await pool.query(
      `UPDATE scoring_rules SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Scoring rule not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(400).json({ error: 'A rule with that event type already exists' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to update scoring rule' });
  }
});

router.delete('/rules/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM scoring_rules WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Scoring rule not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete scoring rule' });
  }
});

router.get('/events', async (req: Request, res: Response) => {
  try {
    const { limit = 50 } = req.query;
    const result = await pool.query(`
      SELECT se.*, p.name as player_name, p.tribe
      FROM scoring_events se
      JOIN players p ON p.id = se.player_id
      ORDER BY se.created_at DESC
      LIMIT $1
    `, [limit]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch scoring events' });
  }
});

router.post('/events', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { player_id, event_type, episode, notes, custom_points } = req.body;
    if (!player_id || !event_type) {
      res.status(400).json({ error: 'player_id and event_type are required' });
      return;
    }

    let points: number;

    if (event_type === 'placement') {
      const placement = custom_points;
      // Get cast_count from the player's season
      const seasonResult = await pool.query(
        'SELECT s.cast_count FROM seasons s JOIN players p ON p.season_id = s.id WHERE p.id = $1',
        [player_id]
      );
      const castCount = seasonResult.rows[0]?.cast_count || 24;

      if (!placement || placement < 1 || placement > castCount) {
        res.status(400).json({ error: `Placement must be between 1 and ${castCount}` });
        return;
      }
      points = castCount + 1 - placement;

      await pool.query(
        'UPDATE players SET placement = $1, is_eliminated = $2 WHERE id = $3',
        [placement, placement > 1, player_id]
      );
    } else {
      // Look up points from scoring rules (scoped by the player's show)
      const ruleResult = await pool.query(`
        SELECT sr.points FROM scoring_rules sr
        JOIN shows sh ON sh.id = sr.show_id
        JOIN seasons s ON s.show_id = sh.id
        JOIN players p ON p.season_id = s.id
        WHERE sr.event_type = $1 AND p.id = $2
        LIMIT 1
      `, [event_type, player_id]);

      if (ruleResult.rows.length === 0) {
        // Fallback: try global lookup for backward compat
        const fallback = await pool.query(
          'SELECT points FROM scoring_rules WHERE event_type = $1 LIMIT 1',
          [event_type]
        );
        if (fallback.rows.length === 0) {
          res.status(400).json({ error: 'Unknown event type' });
          return;
        }
        points = parseFloat(fallback.rows[0].points);
      } else {
        points = parseFloat(ruleResult.rows[0].points);
      }
    }

    const result = await pool.query(
      'INSERT INTO scoring_events (player_id, event_type, points, episode, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [player_id, event_type, points, episode || null, notes || null]
    );

    const playerResult = await pool.query('SELECT name FROM players WHERE id = $1', [player_id]);

    res.status(201).json({
      ...result.rows[0],
      player_name: playerResult.rows[0]?.name,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add scoring event' });
  }
});

router.delete('/events/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM scoring_events WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete scoring event' });
  }
});

router.post('/events/bulk', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { player_ids, event_type, episode, notes } = req.body;
    if (!player_ids || !Array.isArray(player_ids) || !event_type) {
      res.status(400).json({ error: 'player_ids array and event_type are required' });
      return;
    }

    // Look up points from scoring rules
    const ruleResult = await pool.query(
      'SELECT points FROM scoring_rules WHERE event_type = $1 LIMIT 1',
      [event_type]
    );
    if (ruleResult.rows.length === 0) {
      res.status(400).json({ error: 'Unknown event type' });
      return;
    }
    const points = parseFloat(ruleResult.rows[0].points);

    const results = [];
    for (const pid of player_ids) {
      const result = await pool.query(
        'INSERT INTO scoring_events (player_id, event_type, points, episode, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [pid, event_type, points, episode || null, notes || null]
      );
      results.push(result.rows[0]);
    }

    res.status(201).json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add bulk scoring events' });
  }
});

export default router;
