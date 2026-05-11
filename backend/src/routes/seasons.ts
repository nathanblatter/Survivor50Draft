import { Router, Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// List seasons for a show (mounted at /api/shows/:showSlug/seasons)
router.get('/shows/:showSlug/seasons', async (req: Request, res: Response) => {
  try {
    const { showSlug } = req.params;
    const showResult = await pool.query('SELECT id FROM shows WHERE slug = $1', [showSlug]);
    if (showResult.rows.length === 0) {
      res.status(404).json({ error: 'Show not found' });
      return;
    }
    const result = await pool.query(`
      SELECT s.*,
        (SELECT COUNT(*) FROM players p WHERE p.season_id = s.id) as player_count,
        (SELECT COUNT(*) FROM leagues l WHERE l.season_id = s.id) as league_count
      FROM seasons s
      WHERE s.show_id = $1
      ORDER BY s.season_number DESC
    `, [showResult.rows[0].id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch seasons' });
  }
});

// Create season for a show
router.post('/shows/:showSlug/seasons', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { showSlug } = req.params;
    const { season_number, name, cast_count } = req.body;
    if (!season_number) {
      res.status(400).json({ error: 'season_number is required' });
      return;
    }
    const showResult = await pool.query('SELECT id FROM shows WHERE slug = $1', [showSlug]);
    if (showResult.rows.length === 0) {
      res.status(404).json({ error: 'Show not found' });
      return;
    }
    const result = await pool.query(
      'INSERT INTO seasons (show_id, season_number, name, cast_count) VALUES ($1, $2, $3, $4) RETURNING *',
      [showResult.rows[0].id, season_number, name || null, cast_count || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'That season number already exists for this show' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create season' });
  }
});

// Get season by ID
router.get('/seasons/:seasonId', async (req: Request, res: Response) => {
  try {
    const { seasonId } = req.params;
    const result = await pool.query(`
      SELECT s.*, sh.name as show_name, sh.slug as show_slug
      FROM seasons s
      JOIN shows sh ON sh.id = s.show_id
      WHERE s.id = $1
    `, [seasonId]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Season not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch season' });
  }
});

// Update season
router.patch('/seasons/:seasonId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { seasonId } = req.params;
    const { name, cast_count, is_active } = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (cast_count !== undefined) { fields.push(`cast_count = $${idx++}`); values.push(cast_count); }
    if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }
    if (fields.length === 0) {
      res.status(400).json({ error: 'Provide at least one field to update' });
      return;
    }
    values.push(seasonId);
    const result = await pool.query(
      `UPDATE seasons SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Season not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update season' });
  }
});

// Resolve season by show slug + season number (convenience endpoint)
router.get('/shows/:showSlug/seasons/:seasonNum', async (req: Request, res: Response) => {
  try {
    const { showSlug, seasonNum } = req.params;
    const result = await pool.query(`
      SELECT s.*, sh.name as show_name, sh.slug as show_slug
      FROM seasons s
      JOIN shows sh ON sh.id = s.show_id
      WHERE sh.slug = $1 AND s.season_number = $2
    `, [showSlug, parseInt(seasonNum as string)]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Season not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch season' });
  }
});

export default router;
