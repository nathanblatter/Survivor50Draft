import { Router, Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

const PLAYER_SELECT = `
  SELECT p.*,
    COALESCE((SELECT SUM(se.points) FROM scoring_events se WHERE se.player_id = p.id), 0)::float as total_points,
    COALESCE(
      (SELECT json_agg(json_build_object('tribe_name', t.name, 'phase', th.phase, 'episode', th.episode) ORDER BY th.id)
       FROM tribe_history th JOIN tribes t ON t.id = th.tribe_id WHERE th.player_id = p.id),
      '[]'::json
    ) as tribe_history
  FROM players p
`;

// ── GET /api/seasons/:seasonId/players ──
// Optional ?league_id= adds team_id for that league's draft.
router.get('/seasons/:seasonId/players', async (req: Request, res: Response) => {
  try {
    const { seasonId } = req.params;
    const leagueId = req.query.league_id ? parseInt(String(req.query.league_id)) : null;
    const result = await pool.query(
      `${PLAYER_SELECT}
       WHERE p.season_id = $1
       ORDER BY p.tribe, p.name`,
      [seasonId]
    );
    let rows = result.rows.map((r: any) => ({ ...r, team_id: null }));
    if (leagueId) {
      const tp = await pool.query(
        `SELECT tp.player_id, tp.team_id, tp.pick_number FROM team_players tp
         JOIN teams t ON t.id = tp.team_id WHERE t.league_id = $1`,
        [leagueId]
      );
      const byPlayer = new Map<number, any>(tp.rows.map((r: any) => [r.player_id, r]));
      rows = rows.map((r: any) => {
        const pick = byPlayer.get(r.id);
        return { ...r, team_id: pick?.team_id ?? null, pick_number: pick?.pick_number ?? null };
      });
    }
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

async function syncCastCount(seasonId: number | string | string[]) {
  await pool.query(
    'UPDATE seasons SET cast_count = (SELECT COUNT(*) FROM players WHERE season_id = $1) WHERE id = $1',
    [seasonId]
  );
}

// ── POST /api/seasons/:seasonId/players — add single player ──
router.post('/seasons/:seasonId/players', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { seasonId } = req.params;
    const { name, nickname, original_seasons, tribe, photo_url, occupation, hometown } = req.body;
    if (!name || !tribe) {
      res.status(400).json({ error: 'name and tribe are required' });
      return;
    }
    const result = await pool.query(
      `INSERT INTO players (season_id, name, nickname, original_seasons, tribe, photo_url, occupation, hometown)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [seasonId, name, nickname || null, original_seasons || '', tribe, photo_url || null, occupation || null, hometown || null]
    );
    await ensureTribeHistory(result.rows[0].id, seasonId, tribe);
    await syncCastCount(seasonId);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create player' });
  }
});

/** Make sure a player has an "original" tribe_history row for their starting tribe. */
async function ensureTribeHistory(playerId: number, seasonId: number | string | string[], tribeName: string) {
  const tribe = await pool.query('SELECT id FROM tribes WHERE season_id = $1 AND name = $2', [seasonId, tribeName]);
  if (tribe.rows.length === 0) return;
  const existing = await pool.query('SELECT 1 FROM tribe_history WHERE player_id = $1', [playerId]);
  if (existing.rows.length > 0) return;
  await pool.query(
    'INSERT INTO tribe_history (player_id, tribe_id, phase, episode) VALUES ($1, $2, $3, $4)',
    [playerId, tribe.rows[0].id, 'original', 1]
  );
}

// ── POST /api/seasons/:seasonId/players/bulk — bulk import ──
router.post('/seasons/:seasonId/players/bulk', authMiddleware, async (req: Request, res: Response) => {
  const { seasonId } = req.params;
  const { players } = req.body;
  if (!players || !Array.isArray(players) || players.length === 0) {
    res.status(400).json({ error: 'players array is required' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = [];
    for (const p of players) {
      if (!p.name || !p.tribe) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: `Each player needs name and tribe. Missing for: ${JSON.stringify(p)}` });
        return;
      }
      const result = await client.query(
        `INSERT INTO players (season_id, name, nickname, original_seasons, tribe, photo_url, occupation, hometown)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [seasonId, p.name, p.nickname || null, p.original_seasons || '', p.tribe, p.photo_url || null, p.occupation || null, p.hometown || null]
      );
      inserted.push(result.rows[0]);
    }
    await client.query(
      'UPDATE seasons SET cast_count = (SELECT COUNT(*) FROM players WHERE season_id = $1) WHERE id = $1',
      [seasonId]
    );
    await client.query('COMMIT');
    for (const p of inserted) await ensureTribeHistory(p.id, seasonId, p.tribe);
    res.status(201).json(inserted);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk import players' });
  } finally {
    client.release();
  }
});

// ── GET /api/players/:id ──
router.get('/players/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const playerResult = await pool.query(`${PLAYER_SELECT} WHERE p.id = $1`, [id]);
    if (playerResult.rows.length === 0) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
    const eventsResult = await pool.query(
      'SELECT * FROM scoring_events WHERE player_id = $1 ORDER BY episode DESC NULLS LAST, created_at DESC',
      [id]
    );
    res.json({ ...playerResult.rows[0], events: eventsResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch player' });
  }
});

// ── PATCH /api/players/:id ──
router.patch('/players/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const allowed = ['name', 'nickname', 'original_seasons', 'tribe', 'photo_url', 'occupation', 'hometown', 'is_eliminated', 'placement'];
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(req.body[key]);
      }
    }
    if (fields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }
    values.push(id);
    const result = await pool.query(
      `UPDATE players SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update player' });
  }
});

// ── DELETE /api/players/:id ──
router.delete('/players/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM players WHERE id = $1 RETURNING season_id', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
    await syncCastCount(result.rows[0].season_id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete player' });
  }
});

export default router;
