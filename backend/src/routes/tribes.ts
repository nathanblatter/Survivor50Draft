import { Router, Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Get all tribes
router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tribes ORDER BY phase, name'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tribes' });
  }
});

// Create a new tribe
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, color, phase, introduced_episode } = req.body;
    if (!name || !color) {
      res.status(400).json({ error: 'name and color are required' });
      return;
    }
    const result = await pool.query(
      'INSERT INTO tribes (name, color, phase, introduced_episode) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, color, phase || 'swap', introduced_episode || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Tribe name already exists' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create tribe' });
  }
});

// Execute a tribe swap (transactional)
router.post('/swap', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { episode, assignments, new_tribes } = req.body;

    if (!episode || !assignments || !Array.isArray(assignments) || assignments.length === 0) {
      res.status(400).json({ error: 'episode and assignments array are required' });
      return;
    }

    await client.query('BEGIN');

    // Create any new tribes first
    if (new_tribes && Array.isArray(new_tribes)) {
      for (const tribe of new_tribes) {
        const exists = await client.query('SELECT id FROM tribes WHERE name = $1', [tribe.name]);
        if (exists.rows.length === 0) {
          await client.query(
            'INSERT INTO tribes (name, color, phase, introduced_episode, is_active) VALUES ($1, $2, $3, $4, TRUE)',
            [tribe.name, tribe.color, 'swap', episode]
          );
        }
      }
    }

    // Process each player assignment
    for (const { player_id, tribe_name } of assignments) {
      // Update player's current tribe
      await client.query(
        'UPDATE players SET tribe = $1 WHERE id = $2',
        [tribe_name, player_id]
      );

      // Insert tribe history entry
      await client.query(
        'INSERT INTO tribe_history (player_id, tribe_name, phase, episode) VALUES ($1, $2, $3, $4)',
        [player_id, tribe_name, 'swap', episode]
      );
    }

    // Deactivate tribes that no longer have active players
    const activeTribeNames = await client.query(
      'SELECT DISTINCT tribe FROM players WHERE is_eliminated = FALSE'
    );
    const activeNames = activeTribeNames.rows.map((r: any) => r.tribe);
    if (activeNames.length > 0) {
      await client.query(
        `UPDATE tribes SET is_active = (name = ANY($1))
         WHERE phase != 'merge'`,
        [activeNames]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Tribe swap completed for episode ${episode}. ${assignments.length} players reassigned.`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Tribe swap error:', err);
    res.status(500).json({ error: 'Failed to execute tribe swap' });
  } finally {
    client.release();
  }
});

// Execute the merge (transactional)
router.post('/merge', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { episode, tribe_name, tribe_color } = req.body;

    if (!episode || !tribe_name || !tribe_color) {
      res.status(400).json({ error: 'episode, tribe_name, and tribe_color are required' });
      return;
    }

    await client.query('BEGIN');

    // Create merge tribe
    const exists = await client.query('SELECT id FROM tribes WHERE name = $1', [tribe_name]);
    if (exists.rows.length === 0) {
      await client.query(
        'INSERT INTO tribes (name, color, phase, introduced_episode, is_active) VALUES ($1, $2, $3, $4, TRUE)',
        [tribe_name, tribe_color, 'merge', episode]
      );
    }

    // Deactivate all pre-merge tribes
    await client.query(
      `UPDATE tribes SET is_active = FALSE WHERE phase != 'merge'`
    );

    // Get all non-eliminated players
    const activePlayers = await client.query(
      'SELECT id FROM players WHERE is_eliminated = FALSE'
    );

    // Move all active players to merge tribe
    for (const player of activePlayers.rows) {
      await client.query(
        'UPDATE players SET tribe = $1 WHERE id = $2',
        [tribe_name, player.id]
      );
      await client.query(
        'INSERT INTO tribe_history (player_id, tribe_name, phase, episode) VALUES ($1, $2, $3, $4)',
        [player.id, tribe_name, 'merge', episode]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Merge complete! ${activePlayers.rows.length} players joined ${tribe_name}.`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Merge error:', err);
    res.status(500).json({ error: 'Failed to execute merge' });
  } finally {
    client.release();
  }
});

export default router;
