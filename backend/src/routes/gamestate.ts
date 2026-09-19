import { Router, Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ── Idols ──

router.get('/seasons/:seasonId/gamestate/idols', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT gi.*, p.name as player_name, p.tribe
      FROM game_idols gi
      JOIN players p ON p.id = gi.player_id
      WHERE gi.season_id = $1
      ORDER BY gi.is_active DESC, gi.found_episode DESC NULLS LAST, gi.id DESC
    `, [req.params.seasonId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch idols' });
  }
});

router.post('/seasons/:seasonId/gamestate/idols', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { seasonId } = req.params;
    const { player_id, label, found_episode, notes } = req.body;
    if (!player_id) {
      res.status(400).json({ error: 'player_id is required' });
      return;
    }
    const result = await pool.query(
      `INSERT INTO game_idols (season_id, player_id, label, found_episode, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [seasonId, player_id, label || 'Hidden Immunity Idol', found_episode || null, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add idol' });
  }
});

router.patch('/gamestate/idols/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { played_episode, is_active, notes } = req.body;
    const result = await pool.query(
      `UPDATE game_idols SET
        played_episode = COALESCE($1, played_episode),
        is_active = COALESCE($2, is_active),
        notes = COALESCE($3, notes)
       WHERE id = $4 RETURNING *`,
      [played_episode ?? null, is_active ?? null, notes ?? null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update idol' });
  }
});

router.delete('/gamestate/idols/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM game_idols WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete idol' });
  }
});

// ── Advantages ──

router.get('/seasons/:seasonId/gamestate/advantages', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT ga.*, p.name as player_name, p.tribe
      FROM game_advantages ga
      JOIN players p ON p.id = ga.player_id
      WHERE ga.season_id = $1
      ORDER BY ga.is_active DESC, ga.found_episode DESC NULLS LAST, ga.id DESC
    `, [req.params.seasonId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch advantages' });
  }
});

router.post('/seasons/:seasonId/gamestate/advantages', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { seasonId } = req.params;
    const { player_id, advantage_type, found_episode, notes } = req.body;
    if (!player_id || !advantage_type) {
      res.status(400).json({ error: 'player_id and advantage_type are required' });
      return;
    }
    const result = await pool.query(
      `INSERT INTO game_advantages (season_id, player_id, advantage_type, found_episode, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [seasonId, player_id, advantage_type, found_episode || null, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add advantage' });
  }
});

router.patch('/gamestate/advantages/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { played_episode, is_active, notes } = req.body;
    const result = await pool.query(
      `UPDATE game_advantages SET
        played_episode = COALESCE($1, played_episode),
        is_active = COALESCE($2, is_active),
        notes = COALESCE($3, notes)
       WHERE id = $4 RETURNING *`,
      [played_episode ?? null, is_active ?? null, notes ?? null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update advantage' });
  }
});

router.delete('/gamestate/advantages/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM game_advantages WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete advantage' });
  }
});

// ── Alliances ──

router.get('/seasons/:seasonId/gamestate/alliances', async (req: Request, res: Response) => {
  try {
    const alliances = await pool.query(`
      SELECT a.*, json_agg(json_build_object('id', p.id, 'name', p.name, 'tribe', p.tribe, 'is_eliminated', p.is_eliminated))
        FILTER (WHERE p.id IS NOT NULL) as members
      FROM alliances a
      LEFT JOIN alliance_members am ON am.alliance_id = a.id
      LEFT JOIN players p ON p.id = am.player_id
      WHERE a.season_id = $1
      GROUP BY a.id
      ORDER BY a.is_active DESC, a.formed_episode DESC NULLS LAST, a.id DESC
    `, [req.params.seasonId]);
    res.json(alliances.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch alliances' });
  }
});

router.post('/seasons/:seasonId/gamestate/alliances', authMiddleware, async (req: Request, res: Response) => {
  const { seasonId } = req.params;
  const { name, formed_episode, notes, member_ids } = req.body;
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO alliances (season_id, name, formed_episode, notes) VALUES ($1, $2, $3, $4) RETURNING *`,
      [seasonId, name, formed_episode || null, notes || null]
    );
    const alliance = result.rows[0];
    for (const pid of member_ids || []) {
      await client.query(
        'INSERT INTO alliance_members (alliance_id, player_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [alliance.id, pid]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(alliance);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to create alliance' });
  } finally {
    client.release();
  }
});

router.patch('/gamestate/alliances/:id', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, is_active, notes, member_ids } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE alliances SET
        name = COALESCE($1, name),
        is_active = COALESCE($2, is_active),
        notes = COALESCE($3, notes)
       WHERE id = $4 RETURNING *`,
      [name ?? null, is_active ?? null, notes ?? null, id]
    );
    if (member_ids !== undefined) {
      await client.query('DELETE FROM alliance_members WHERE alliance_id = $1', [id]);
      for (const pid of member_ids) {
        await client.query('INSERT INTO alliance_members (alliance_id, player_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, pid]);
      }
    }
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to update alliance' });
  } finally {
    client.release();
  }
});

router.delete('/gamestate/alliances/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM alliances WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete alliance' });
  }
});

export default router;
