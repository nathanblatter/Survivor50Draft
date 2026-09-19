import { Router, Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ── GET /api/seasons/:seasonId/tribes ──
router.get('/seasons/:seasonId/tribes', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT t.*, (SELECT COUNT(*)::int FROM players p WHERE p.season_id = t.season_id AND p.tribe = t.name AND NOT p.is_eliminated) as active_players
       FROM tribes t WHERE t.season_id = $1 ORDER BY t.id`,
      [req.params.seasonId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tribes' });
  }
});

// ── POST /api/seasons/:seasonId/tribes ──
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
      [seasonId, String(name).trim(), color, phase || 'original', introduced_episode || null]
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

// ── PATCH /api/tribes/:id — rename / recolor; renaming cascades to players.tribe ──
router.patch('/tribes/:id', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, color, is_active } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM tribes WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Tribe not found' });
      return;
    }
    const tribe = current.rows[0];
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (name !== undefined && name.trim()) { fields.push(`name = $${idx++}`); values.push(name.trim()); }
    if (color !== undefined) { fields.push(`color = $${idx++}`); values.push(color); }
    if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }
    if (fields.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Provide name, color, or is_active' });
      return;
    }
    values.push(id);
    const result = await client.query(`UPDATE tribes SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    if (name !== undefined && name.trim() && name.trim() !== tribe.name) {
      await client.query('UPDATE players SET tribe = $1 WHERE season_id = $2 AND tribe = $3', [name.trim(), tribe.season_id, tribe.name]);
    }
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      res.status(409).json({ error: 'Tribe name already exists for this season' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to update tribe' });
  } finally {
    client.release();
  }
});

// ── DELETE /api/tribes/:id — only when no player currently belongs to it ──
router.delete('/tribes/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tribe = await pool.query('SELECT * FROM tribes WHERE id = $1', [id]);
    if (tribe.rows.length === 0) {
      res.status(404).json({ error: 'Tribe not found' });
      return;
    }
    const members = await pool.query(
      'SELECT COUNT(*)::int as n FROM players WHERE season_id = $1 AND tribe = $2',
      [tribe.rows[0].season_id, tribe.rows[0].name]
    );
    if (members.rows[0].n > 0) {
      res.status(400).json({ error: `Move the ${members.rows[0].n} players off this tribe first` });
      return;
    }
    await pool.query('DELETE FROM tribes WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete tribe' });
  }
});

// ── POST /api/seasons/:seasonId/tribes/swap ──
router.post('/seasons/:seasonId/tribes/swap', authMiddleware, async (req: Request, res: Response) => {
  const seasonId = parseInt(req.params.seasonId as string);
  const { episode, assignments, new_tribes } = req.body;
  if (!episode || !assignments || !Array.isArray(assignments) || assignments.length === 0) {
    res.status(400).json({ error: 'episode and assignments array are required' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (new_tribes && Array.isArray(new_tribes)) {
      for (const tribe of new_tribes) {
        await client.query(
          `INSERT INTO tribes (season_id, name, color, phase, introduced_episode, is_active)
           VALUES ($1, $2, $3, 'swap', $4, TRUE)
           ON CONFLICT (season_id, name) DO UPDATE SET is_active = TRUE`,
          [seasonId, tribe.name, tribe.color, episode]
        );
      }
    }

    for (const { player_id, tribe_name } of assignments) {
      const tribeRow = await client.query(
        'SELECT id FROM tribes WHERE name = $1 AND season_id = $2',
        [tribe_name, seasonId]
      );
      if (tribeRow.rows.length === 0) throw new Error(`Unknown tribe ${tribe_name}`);
      await client.query('UPDATE players SET tribe = $1 WHERE id = $2 AND season_id = $3', [tribe_name, player_id, seasonId]);
      await client.query(
        'INSERT INTO tribe_history (player_id, tribe_id, phase, episode) VALUES ($1, $2, $3, $4)',
        [player_id, tribeRow.rows[0].id, 'swap', episode]
      );
    }

    // Deactivate tribes with no remaining active players
    await client.query(
      `UPDATE tribes t SET is_active = EXISTS (
         SELECT 1 FROM players p WHERE p.season_id = t.season_id AND p.tribe = t.name AND NOT p.is_eliminated
       ) WHERE t.season_id = $1 AND t.phase != 'merge'`,
      [seasonId]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: `Tribe swap completed for episode ${episode}. ${assignments.length} players reassigned.` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Tribe swap error:', err);
    res.status(500).json({ error: 'Failed to execute tribe swap' });
  } finally {
    client.release();
  }
});

// ── POST /api/seasons/:seasonId/tribes/merge ──
router.post('/seasons/:seasonId/tribes/merge', authMiddleware, async (req: Request, res: Response) => {
  const seasonId = parseInt(req.params.seasonId as string);
  const { episode, tribe_name, tribe_color } = req.body;
  if (!episode || !tribe_name || !tribe_color) {
    res.status(400).json({ error: 'episode, tribe_name, and tribe_color are required' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const merge = await client.query(
      `INSERT INTO tribes (season_id, name, color, phase, introduced_episode, is_active)
       VALUES ($1, $2, $3, 'merge', $4, TRUE)
       ON CONFLICT (season_id, name) DO UPDATE SET phase = 'merge', is_active = TRUE, color = EXCLUDED.color
       RETURNING id`,
      [seasonId, tribe_name, tribe_color, episode]
    );
    const mergeTribeId = merge.rows[0].id;
    await client.query(`UPDATE tribes SET is_active = FALSE WHERE phase != 'merge' AND season_id = $1`, [seasonId]);

    const activePlayers = await client.query(
      'SELECT id FROM players WHERE is_eliminated = FALSE AND season_id = $1',
      [seasonId]
    );
    for (const player of activePlayers.rows) {
      await client.query('UPDATE players SET tribe = $1 WHERE id = $2', [tribe_name, player.id]);
      await client.query(
        'INSERT INTO tribe_history (player_id, tribe_id, phase, episode) VALUES ($1, $2, $3, $4)',
        [player.id, mergeTribeId, 'merge', episode]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, message: `Merge complete! ${activePlayers.rows.length} players joined ${tribe_name}.` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Merge error:', err);
    res.status(500).json({ error: 'Failed to execute merge' });
  } finally {
    client.release();
  }
});

export default router;
