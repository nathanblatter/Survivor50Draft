import { Router, Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../middleware/auth';
import { insertEvents, ScoringError, seasonForPlayer, EventInput } from '../lib/scoring';

const router = Router();

function sendScoringError(res: Response, err: unknown, fallback: string) {
  if (err instanceof ScoringError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: fallback });
}

// ── Rules (show-scoped) ──

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
    res.json(result.rows.map((r: any) => ({ ...r, points: parseFloat(r.points) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch scoring rules' });
  }
});

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
      [showResult.rows[0].id, String(event_type).trim(), points, description, is_variable || false]
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

router.patch('/rules/:id', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { event_type, points, description, is_variable } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM scoring_rules WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Scoring rule not found' });
      return;
    }
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (event_type !== undefined) { fields.push(`event_type = $${idx++}`); values.push(event_type); }
    if (points !== undefined) { fields.push(`points = $${idx++}`); values.push(points); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (is_variable !== undefined) { fields.push(`is_variable = $${idx++}`); values.push(is_variable); }
    if (fields.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Provide at least one field to update' });
      return;
    }
    values.push(id);
    const result = await client.query(
      `UPDATE scoring_rules SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    // Keep historical events pointing at the renamed rule.
    if (event_type !== undefined && event_type !== current.rows[0].event_type) {
      await client.query(
        `UPDATE scoring_events se SET event_type = $1
         FROM players p JOIN seasons s ON s.id = p.season_id
         WHERE se.player_id = p.id AND s.show_id = $2 AND se.event_type = $3`,
        [event_type, current.rows[0].show_id, current.rows[0].event_type]
      );
    }
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      res.status(400).json({ error: 'A rule with that event type already exists' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to update scoring rule' });
  } finally {
    client.release();
  }
});

router.delete('/rules/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM scoring_rules WHERE id = $1 RETURNING *', [req.params.id]);
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

// ── Events (season-scoped) ──

// GET /api/seasons/:seasonId/scoring/events?limit=&episode=
router.get('/seasons/:seasonId/scoring/events', async (req: Request, res: Response) => {
  try {
    const { seasonId } = req.params;
    const limit = Math.min(parseInt(String(req.query.limit || 100)) || 100, 2000);
    const episode = req.query.episode ? parseInt(String(req.query.episode)) : null;
    const params: any[] = [seasonId];
    let where = 'WHERE p.season_id = $1';
    if (episode) { params.push(episode); where += ` AND se.episode = $${params.length}`; }
    params.push(limit);
    const result = await pool.query(`
      SELECT se.*, p.name as player_name, p.tribe
      FROM scoring_events se
      JOIN players p ON p.id = se.player_id
      ${where}
      ORDER BY se.created_at DESC, se.id DESC
      LIMIT $${params.length}
    `, params);
    res.json(result.rows.map((r: any) => ({ ...r, points: parseFloat(r.points) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch scoring events' });
  }
});

// POST /api/seasons/:seasonId/scoring/events — one or many events, all-or-nothing
router.post('/seasons/:seasonId/scoring/events', authMiddleware, async (req: Request, res: Response) => {
  const seasonId = parseInt(req.params.seasonId as string);
  const body = req.body;
  const events: EventInput[] = Array.isArray(body?.events) ? body.events : [body];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await insertEvents(client, seasonId, events);
    await client.query('COMMIT');
    res.status(201).json(inserted);
  } catch (err) {
    await client.query('ROLLBACK');
    sendScoringError(res, err, 'Failed to add scoring events');
  } finally {
    client.release();
  }
});

// Convenience: add events for a single player without knowing the season
router.post('/players/:playerId/events', authMiddleware, async (req: Request, res: Response) => {
  const playerId = parseInt(req.params.playerId as string);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const seasonId = await seasonForPlayer(client, playerId);
    const inserted = await insertEvents(client, seasonId, [{ ...req.body, player_id: playerId }]);
    await client.query('COMMIT');
    res.status(201).json(inserted[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    sendScoringError(res, err, 'Failed to add scoring event');
  } finally {
    client.release();
  }
});

router.delete('/scoring/events/:id', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const del = await client.query('DELETE FROM scoring_events WHERE id = $1 RETURNING *', [req.params.id]);
    if (del.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    // Deleting a placement event un-eliminates the player (unless another placement event remains).
    const ev = del.rows[0];
    if (ev.event_type === 'placement') {
      const other = await client.query(
        "SELECT 1 FROM scoring_events WHERE player_id = $1 AND event_type = 'placement' LIMIT 1",
        [ev.player_id]
      );
      if (other.rows.length === 0) {
        await client.query('UPDATE players SET is_eliminated = false, placement = NULL WHERE id = $1', [ev.player_id]);
      }
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to delete scoring event' });
  } finally {
    client.release();
  }
});

export default router;
