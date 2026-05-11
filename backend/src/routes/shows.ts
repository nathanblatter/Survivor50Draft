import { Router, Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// List all shows
router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT s.*,
        (SELECT COUNT(*) FROM seasons se WHERE se.show_id = s.id) as season_count
      FROM shows s ORDER BY s.name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch shows' });
  }
});

// Get show by slug
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const result = await pool.query('SELECT * FROM shows WHERE slug = $1', [slug]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Show not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch show' });
  }
});

// Create show
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, slug, description } = req.body;
    if (!name || !slug) {
      res.status(400).json({ error: 'name and slug are required' });
      return;
    }
    const result = await pool.query(
      'INSERT INTO shows (name, slug, description) VALUES ($1, $2, $3) RETURNING *',
      [name, slug, description || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'A show with that slug already exists' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create show' });
  }
});

// Update show
router.patch('/:slug', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { name, description } = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (fields.length === 0) {
      res.status(400).json({ error: 'Provide at least one field to update' });
      return;
    }
    values.push(slug);
    const result = await pool.query(
      `UPDATE shows SET ${fields.join(', ')} WHERE slug = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Show not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update show' });
  }
});

// Delete show
router.delete('/:slug', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const result = await pool.query('DELETE FROM shows WHERE slug = $1 RETURNING *', [slug]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Show not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete show' });
  }
});

export default router;
