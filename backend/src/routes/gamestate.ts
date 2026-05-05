import { Router, Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ── Idols ──

router.get('/idols', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT gi.*, p.name as player_name, p.tribe
      FROM game_idols gi
      JOIN players p ON p.id = gi.player_id
      ORDER BY gi.is_active DESC, gi.found_episode DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch idols' });
  }
});

router.post('/idols', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { player_id, label, found_episode, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO game_idols (player_id, label, found_episode, notes)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [player_id, label || 'Hidden Immunity Idol', found_episode, notes]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add idol' });
  }
});

router.patch('/idols/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { played_episode, is_active, notes } = req.body;
    const result = await pool.query(
      `UPDATE game_idols SET
        played_episode = COALESCE($1, played_episode),
        is_active = COALESCE($2, is_active),
        notes = COALESCE($3, notes)
       WHERE id = $4 RETURNING *`,
      [played_episode, is_active, notes, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update idol' });
  }
});

router.delete('/idols/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM game_idols WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete idol' });
  }
});

// ── Advantages ──

router.get('/advantages', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT ga.*, p.name as player_name, p.tribe
      FROM game_advantages ga
      JOIN players p ON p.id = ga.player_id
      ORDER BY ga.is_active DESC, ga.found_episode DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch advantages' });
  }
});

router.post('/advantages', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { player_id, advantage_type, found_episode, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO game_advantages (player_id, advantage_type, found_episode, notes)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [player_id, advantage_type, found_episode, notes]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add advantage' });
  }
});

router.patch('/advantages/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { played_episode, is_active, notes } = req.body;
    const result = await pool.query(
      `UPDATE game_advantages SET
        played_episode = COALESCE($1, played_episode),
        is_active = COALESCE($2, is_active),
        notes = COALESCE($3, notes)
       WHERE id = $4 RETURNING *`,
      [played_episode, is_active, notes, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update advantage' });
  }
});

router.delete('/advantages/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM game_advantages WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete advantage' });
  }
});

// ── Alliances ──

router.get('/alliances', async (_req: Request, res: Response) => {
  try {
    const alliances = await pool.query(`
      SELECT a.*, json_agg(json_build_object('id', p.id, 'name', p.name, 'tribe', p.tribe, 'is_eliminated', p.is_eliminated))
        FILTER (WHERE p.id IS NOT NULL) as members
      FROM alliances a
      LEFT JOIN alliance_members am ON am.alliance_id = a.id
      LEFT JOIN players p ON p.id = am.player_id
      GROUP BY a.id
      ORDER BY a.is_active DESC, a.formed_episode DESC
    `);
    res.json(alliances.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch alliances' });
  }
});

router.post('/alliances', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, formed_episode, notes, member_ids } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO alliances (name, formed_episode, notes) VALUES ($1, $2, $3) RETURNING *`,
        [name, formed_episode, notes]
      );
      const alliance = result.rows[0];
      if (member_ids?.length) {
        for (const pid of member_ids) {
          await client.query(
            'INSERT INTO alliance_members (alliance_id, player_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [alliance.id, pid]
          );
        }
      }
      await client.query('COMMIT');
      res.json(alliance);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create alliance' });
  }
});

router.patch('/alliances/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
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
        [name, is_active, notes, id]
      );
      if (member_ids !== undefined) {
        await client.query('DELETE FROM alliance_members WHERE alliance_id = $1', [id]);
        for (const pid of member_ids) {
          await client.query(
            'INSERT INTO alliance_members (alliance_id, player_id) VALUES ($1, $2)',
            [id, pid]
          );
        }
      }
      await client.query('COMMIT');
      res.json(result.rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update alliance' });
  }
});

router.delete('/alliances/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM alliances WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete alliance' });
  }
});

// ── Full game state snapshot (used by AI summary) ──

router.get('/snapshot', async (_req: Request, res: Response) => {
  try {
    const [idols, advantages, alliances] = await Promise.all([
      pool.query(`
        SELECT gi.*, p.name as player_name FROM game_idols gi
        JOIN players p ON p.id = gi.player_id WHERE gi.is_active = true
      `),
      pool.query(`
        SELECT ga.*, p.name as player_name FROM game_advantages ga
        JOIN players p ON p.id = ga.player_id WHERE ga.is_active = true
      `),
      pool.query(`
        SELECT a.*, json_agg(p.name) FILTER (WHERE p.id IS NOT NULL) as member_names
        FROM alliances a
        LEFT JOIN alliance_members am ON am.alliance_id = a.id
        LEFT JOIN players p ON p.id = am.player_id
        WHERE a.is_active = true
        GROUP BY a.id
      `),
    ]);
    res.json({
      idols: idols.rows,
      advantages: advantages.rows,
      alliances: alliances.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch game state' });
  }
});

export default router;
