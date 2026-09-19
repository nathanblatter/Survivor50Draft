import { Router, Request, Response } from 'express';
import pool from '../db';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../middleware/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'fantasydraft-secret-key';

function hasAdminToken(auth?: string): boolean {
  if (!auth?.startsWith('Bearer ')) return false;
  try { jwt.verify(auth.slice(7), JWT_SECRET); return true; } catch { return false; }
}

const router = Router();

interface LeagueDraftInfo {
  cast_count: number;
  roster_size: number | null;
  team_ids_in_order: number[]; // teams with a draft_order, ascending
  team_count: number;
}

async function leagueInfo(leagueId: number | string): Promise<LeagueDraftInfo | null> {
  const r = await pool.query(`
    SELECT s.cast_count, l.roster_size FROM leagues l JOIN seasons s ON s.id = l.season_id WHERE l.id = $1
  `, [leagueId]);
  if (r.rows.length === 0) return null;
  const teams = await pool.query('SELECT id, draft_order FROM teams WHERE league_id = $1 ORDER BY draft_order NULLS LAST, id', [leagueId]);
  return {
    cast_count: r.rows[0].cast_count,
    roster_size: r.rows[0].roster_size,
    team_ids_in_order: teams.rows.filter((t: any) => t.draft_order !== null).map((t: any) => t.id),
    team_count: teams.rows.length,
  };
}

/** Effective roster size: explicit, else floor(cast / teams). */
function rosterSize(info: LeagueDraftInfo): number {
  if (info.roster_size) return info.roster_size;
  if (info.team_count === 0) return 0;
  return Math.floor(info.cast_count / info.team_count);
}

/** Snake order: which team owns pick number n (1-based)? */
export function teamForPick(order: number[], pickNumber: number, snake = true): number | null {
  if (order.length === 0) return null;
  const round = Math.floor((pickNumber - 1) / order.length);
  const idx = (pickNumber - 1) % order.length;
  const reversed = snake && round % 2 === 1;
  return order[reversed ? order.length - 1 - idx : idx];
}

async function buildState(leagueId: number | string) {
  const stateRes = await pool.query('SELECT * FROM draft_state WHERE league_id = $1', [leagueId]);
  const state = stateRes.rows[0] || { league_id: Number(leagueId), is_active: false, is_complete: false, current_pick: 1, snake_draft: true, seconds_per_pick: null, pick_deadline: null };
  const info = await leagueInfo(leagueId);
  if (!info) return null;
  const picks = await pool.query(`
    SELECT COUNT(*)::int as n FROM team_players tp JOIN teams t ON t.id = tp.team_id WHERE t.league_id = $1
  `, [leagueId]);
  const pickNumber = picks.rows[0].n + 1;
  const size = rosterSize(info);
  const totalPicks = size * info.team_count;
  const ordered = info.team_ids_in_order.length === info.team_count && info.team_count > 0;
  const onTheClock = state.is_active && ordered && pickNumber <= totalPicks
    ? teamForPick(info.team_ids_in_order, pickNumber, state.snake_draft !== false)
    : null;
  return {
    ...state,
    current_pick: pickNumber,
    roster_size: size,
    total_picks: totalPicks,
    round: ordered ? Math.min(Math.ceil(pickNumber / info.team_count), size) : null,
    order_set: ordered,
    on_the_clock_team_id: onTheClock,
    order: info.team_ids_in_order,
  };
}

// ── GET /api/leagues/:leagueId/draft/state ──
router.get('/leagues/:leagueId/draft/state', async (req: Request, res: Response) => {
  try {
    const state = await buildState(req.params.leagueId as string);
    if (!state) { res.status(404).json({ error: 'League not found' }); return; }
    res.json(state);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch draft state' });
  }
});

// ── POST /api/leagues/:leagueId/draft/order — set/randomize draft order ──
// body: { team_ids?: number[]; randomize?: boolean; roster_size?: number|null; seconds_per_pick?: number|null; snake?: boolean }
router.post('/leagues/:leagueId/draft/order', authMiddleware, async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId as string);
  const { team_ids, randomize, roster_size, seconds_per_pick, snake } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const teams = await client.query('SELECT id FROM teams WHERE league_id = $1 ORDER BY draft_order NULLS LAST, id', [leagueId]);
    let ids: number[] = teams.rows.map((t: any) => t.id);
    if (Array.isArray(team_ids) && team_ids.length) {
      const valid = new Set(ids);
      if (team_ids.some((id: number) => !valid.has(id)) || new Set(team_ids).size !== ids.length) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'team_ids must include every team in the league exactly once' });
        return;
      }
      ids = team_ids;
    } else if (randomize) {
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
    }
    for (let i = 0; i < ids.length; i++) {
      await client.query('UPDATE teams SET draft_order = $1 WHERE id = $2', [i + 1, ids[i]]);
    }
    if (roster_size !== undefined) {
      await client.query('UPDATE leagues SET roster_size = $1 WHERE id = $2', [roster_size || null, leagueId]);
    }
    await client.query(
      `INSERT INTO draft_state (league_id, seconds_per_pick, snake_draft) VALUES ($1, $2, $3)
       ON CONFLICT (league_id) DO UPDATE SET
         seconds_per_pick = CASE WHEN $4 THEN $2 ELSE draft_state.seconds_per_pick END,
         snake_draft = CASE WHEN $5 THEN $3 ELSE draft_state.snake_draft END,
         updated_at = NOW()`,
      [leagueId, seconds_per_pick ?? null, snake ?? true, seconds_per_pick !== undefined, snake !== undefined]
    );
    await client.query('COMMIT');
    res.json(await buildState(leagueId));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to set draft order' });
  } finally {
    client.release();
  }
});

// ── POST /api/leagues/:leagueId/draft/start ──
router.post('/leagues/:leagueId/draft/start', authMiddleware, async (req: Request, res: Response) => {
  try {
    const leagueId = parseInt(req.params.leagueId as string);
    const info = await leagueInfo(leagueId);
    if (!info) { res.status(404).json({ error: 'League not found' }); return; }
    if (info.team_count < 2) { res.status(400).json({ error: 'Add at least two teams before starting the draft' }); return; }
    if (info.team_ids_in_order.length !== info.team_count) {
      res.status(400).json({ error: 'Set the draft order first (or randomize it)' });
      return;
    }
    await pool.query(
      `INSERT INTO draft_state (league_id, is_active, is_complete, current_pick, pick_deadline)
       VALUES ($1, true, false, 1, CASE WHEN (SELECT seconds_per_pick FROM draft_state WHERE league_id = $1) IS NOT NULL THEN NOW() + ((SELECT seconds_per_pick FROM draft_state WHERE league_id = $1) || ' seconds')::interval ELSE NULL END)
       ON CONFLICT (league_id) DO UPDATE SET is_active = true, is_complete = false, updated_at = NOW(),
         pick_deadline = CASE WHEN draft_state.seconds_per_pick IS NOT NULL THEN NOW() + (draft_state.seconds_per_pick || ' seconds')::interval ELSE NULL END`,
      [leagueId]
    );
    res.json(await buildState(leagueId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start draft' });
  }
});

// ── POST /api/leagues/:leagueId/draft/pause ──
router.post('/leagues/:leagueId/draft/pause', authMiddleware, async (req: Request, res: Response) => {
  try {
    await pool.query('UPDATE draft_state SET is_active = false, pick_deadline = NULL, updated_at = NOW() WHERE league_id = $1', [req.params.leagueId]);
    res.json(await buildState(req.params.leagueId as string));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to pause draft' });
  }
});

// ── POST /api/leagues/:leagueId/draft/pick — public (league members draft themselves) ──
// body: { team_id, player_id, force?: boolean }  (force requires admin and skips turn enforcement)
router.post('/leagues/:leagueId/draft/pick', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId as string);
  const { team_id, player_id, force } = req.body;
  if (!team_id || !player_id) {
    res.status(400).json({ error: 'team_id and player_id are required' });
    return;
  }
  const isAdmin = hasAdminToken(req.headers.authorization);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize picks per league so two simultaneous picks can't both take the same player.
    await client.query('SELECT pg_advisory_xact_lock($1)', [leagueId]);

    const teamCheck = await client.query('SELECT id FROM teams WHERE id = $1 AND league_id = $2', [team_id, leagueId]);
    if (teamCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Team not found in this league' });
      return;
    }
    const playerCheck = await client.query(`
      SELECT p.id FROM players p JOIN leagues l ON l.season_id = p.season_id WHERE p.id = $1 AND l.id = $2
    `, [player_id, leagueId]);
    if (playerCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Player is not in this season' });
      return;
    }
    const existing = await client.query(`
      SELECT t.name FROM team_players tp JOIN teams t ON t.id = tp.team_id WHERE tp.player_id = $1 AND t.league_id = $2
    `, [player_id, leagueId]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: `Already drafted by ${existing.rows[0].name}` });
      return;
    }

    const state = await buildState(leagueId);
    if (!state) { await client.query('ROLLBACK'); res.status(404).json({ error: 'League not found' }); return; }
    if (state.is_complete) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'The draft is complete' });
      return;
    }
    if (state.roster_size > 0) {
      const rosterCount = await client.query('SELECT COUNT(*)::int as n FROM team_players WHERE team_id = $1', [team_id]);
      if (rosterCount.rows[0].n >= state.roster_size) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: `This team already has ${state.roster_size} players` });
        return;
      }
    }
    if (state.is_active && state.on_the_clock_team_id && state.on_the_clock_team_id !== Number(team_id) && !(force && isAdmin)) {
      await client.query('ROLLBACK');
      const clockTeam = await pool.query('SELECT name FROM teams WHERE id = $1', [state.on_the_clock_team_id]);
      res.status(409).json({ error: `It's ${clockTeam.rows[0]?.name || 'another team'}'s pick` });
      return;
    }

    const pickNumber = state.current_pick;
    await client.query(
      'INSERT INTO team_players (team_id, player_id, pick_number) VALUES ($1, $2, $3)',
      [team_id, player_id, pickNumber]
    );
    const complete = state.total_picks > 0 && pickNumber >= state.total_picks;
    await client.query(
      `INSERT INTO draft_state (league_id, is_active, is_complete, current_pick)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (league_id) DO UPDATE SET current_pick = $4, is_complete = $3,
         is_active = CASE WHEN $3 THEN false ELSE draft_state.is_active END,
         pick_deadline = CASE WHEN $3 OR draft_state.seconds_per_pick IS NULL THEN NULL ELSE NOW() + (draft_state.seconds_per_pick || ' seconds')::interval END,
         updated_at = NOW()`,
      [leagueId, !complete, complete, pickNumber + 1]
    );

    await client.query('COMMIT');
    res.json({ success: true, pick_number: pickNumber, is_complete: complete });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to make draft pick' });
  } finally {
    client.release();
  }
});

// ── DELETE /api/leagues/:leagueId/draft/pick/:playerId ──
router.delete('/leagues/:leagueId/draft/pick/:playerId', authMiddleware, async (req: Request, res: Response) => {
  const { leagueId, playerId } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [parseInt(leagueId as string)]);
    const del = await client.query(`
      DELETE FROM team_players WHERE player_id = $1 AND team_id IN (SELECT id FROM teams WHERE league_id = $2)
      RETURNING pick_number
    `, [playerId, leagueId]);
    if (del.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'That player is not drafted in this league' });
      return;
    }
    // Close the gap so pick numbers stay contiguous.
    await client.query(`
      UPDATE team_players SET pick_number = pick_number - 1
      WHERE pick_number > $1 AND team_id IN (SELECT id FROM teams WHERE league_id = $2)
    `, [del.rows[0].pick_number, leagueId]);
    await client.query(
      'UPDATE draft_state SET is_complete = false, updated_at = NOW() WHERE league_id = $1',
      [leagueId]
    );
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to undo draft pick' });
  } finally {
    client.release();
  }
});

// ── POST /api/leagues/:leagueId/draft/reset ──
router.post('/leagues/:leagueId/draft/reset', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { leagueId } = req.params;
    await pool.query('DELETE FROM team_players WHERE team_id IN (SELECT id FROM teams WHERE league_id = $1)', [leagueId]);
    await pool.query(
      `INSERT INTO draft_state (league_id, is_active, is_complete, current_pick) VALUES ($1, false, false, 1)
       ON CONFLICT (league_id) DO UPDATE SET is_active = false, is_complete = false, current_pick = 1, pick_deadline = NULL, updated_at = NOW()`,
      [leagueId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset draft' });
  }
});

export default router;
