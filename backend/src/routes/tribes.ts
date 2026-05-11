import { Router, Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ── Scoped: GET /api/seasons/:seasonId/tribes ──
router.get('/seasons/:seasonId/tribes', async (req: Request, res: Response) => {
  try {
    const { seasonId } = req.params;
    const result = await pool.query(
      'SELECT * FROM tribes WHERE season_id = $1 ORDER BY phase, name',
      [seasonId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tribes' });
  }
});

// ── Scoped: POST /api/seasons/:seasonId/tribes ──
router.post('/seasons/:seasonId/tribes', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { seasonId } = req.params;
    const { name, color, phase, introduced_episode } = req.body;
    if (!name || !color) {
      res.status(400).json({ error: 'name and color are required' });
      return;
    }
    const result = await pool.query(
      'INSERT INTO tribes (season_id, name, color, phase, introduced_episode) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [seasonId, name, color, phase || 'swap', introduced_episode || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Tribe name already exists for this season' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create tribe' });
  }
});

// ── Legacy: GET /api/tribes ──
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

// ── Legacy: POST /api/tribes ──
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, color, phase, introduced_episode, season_id } = req.body;
    if (!name || !color) {
      res.status(400).json({ error: 'name and color are required' });
      return;
    }
    let sid = season_id;
    if (!sid) {
      const defaultSeason = await pool.query('SELECT id FROM seasons ORDER BY id LIMIT 1');
      sid = defaultSeason.rows[0]?.id;
    }
    const result = await pool.query(
      'INSERT INTO tribes (season_id, name, color, phase, introduced_episode) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [sid, name, color, phase || 'swap', introduced_episode || null]
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

// Tribe swap
router.post('/swap', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { episode, assignments, new_tribes } = req.body;

    if (!episode || !assignments || !Array.isArray(assignments) || assignments.length === 0) {
      res.status(400).json({ error: 'episode and assignments array are required' });
      return;
    }

    await client.query('BEGIN');

    // Get the season_id from the first player in assignments
    let seasonId: number | null = null;
    if (assignments.length > 0) {
      const playerResult = await client.query('SELECT season_id FROM players WHERE id = $1', [assignments[0].player_id]);
      seasonId = playerResult.rows[0]?.season_id;
    }

    if (new_tribes && Array.isArray(new_tribes)) {
      for (const tribe of new_tribes) {
        const exists = await client.query(
          'SELECT id FROM tribes WHERE name = $1 AND season_id = $2',
          [tribe.name, seasonId]
        );
        if (exists.rows.length === 0) {
          await client.query(
            'INSERT INTO tribes (season_id, name, color, phase, introduced_episode, is_active) VALUES ($1, $2, $3, $4, $5, TRUE)',
            [seasonId, tribe.name, tribe.color, 'swap', episode]
          );
        }
      }
    }

    for (const { player_id, tribe_name } of assignments) {
      await client.query(
        'UPDATE players SET tribe = $1 WHERE id = $2',
        [tribe_name, player_id]
      );

      const tribeRow = await client.query(
        'SELECT id FROM tribes WHERE name = $1 AND season_id = $2',
        [tribe_name, seasonId]
      );
      if (tribeRow.rows.length === 0) continue;
      const tribe_id = tribeRow.rows[0].id;
      await client.query(
        'INSERT INTO tribe_history (player_id, tribe_id, phase, episode) VALUES ($1, $2, $3, $4)',
        [player_id, tribe_id, 'swap', episode]
      );
    }

    // Deactivate tribes that no longer have active players (within this season)
    const activeTribeNames = await client.query(
      'SELECT DISTINCT tribe FROM players WHERE is_eliminated = FALSE AND season_id = $1',
      [seasonId]
    );
    const activeNames = activeTribeNames.rows.map((r: any) => r.tribe);
    if (activeNames.length > 0) {
      await client.query(
        `UPDATE tribes SET is_active = (name = ANY($1))
         WHERE phase != 'merge' AND season_id = $2`,
        [activeNames, seasonId]
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

// Merge
router.post('/merge', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { episode, tribe_name, tribe_color, season_id } = req.body;

    if (!episode || !tribe_name || !tribe_color) {
      res.status(400).json({ error: 'episode, tribe_name, and tribe_color are required' });
      return;
    }

    await client.query('BEGIN');

    // Determine season_id
    let seasonId = season_id;
    if (!seasonId) {
      const defaultSeason = await client.query('SELECT id FROM seasons ORDER BY id LIMIT 1');
      seasonId = defaultSeason.rows[0]?.id;
    }

    let mergeTribeResult = await client.query(
      'SELECT id FROM tribes WHERE name = $1 AND season_id = $2',
      [tribe_name, seasonId]
    );
    if (mergeTribeResult.rows.length === 0) {
      mergeTribeResult = await client.query(
        'INSERT INTO tribes (season_id, name, color, phase, introduced_episode, is_active) VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id',
        [seasonId, tribe_name, tribe_color, 'merge', episode]
      );
    }
    const merge_tribe_id = mergeTribeResult.rows[0].id;

    await client.query(
      `UPDATE tribes SET is_active = FALSE WHERE phase != 'merge' AND season_id = $1`,
      [seasonId]
    );

    const activePlayers = await client.query(
      'SELECT id FROM players WHERE is_eliminated = FALSE AND season_id = $1',
      [seasonId]
    );

    for (const player of activePlayers.rows) {
      await client.query(
        'UPDATE players SET tribe = $1 WHERE id = $2',
        [tribe_name, player.id]
      );
      await client.query(
        'INSERT INTO tribe_history (player_id, tribe_id, phase, episode) VALUES ($1, $2, $3, $4)',
        [player.id, merge_tribe_id, 'merge', episode]
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
