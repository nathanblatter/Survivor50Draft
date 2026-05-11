import { Router, Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Helper: get cast_count for a league's season
async function getCastCount(leagueId: number): Promise<number> {
  const result = await pool.query(`
    SELECT s.cast_count FROM seasons s
    JOIN leagues l ON l.season_id = s.id
    WHERE l.id = $1
  `, [leagueId]);
  return result.rows[0]?.cast_count || 24;
}

// ── Scoped: GET /api/leagues/:leagueId/draft/state ──
router.get('/leagues/:leagueId/draft/state', async (req: Request, res: Response) => {
  try {
    const { leagueId } = req.params;
    const stateResult = await pool.query('SELECT * FROM draft_state WHERE league_id = $1', [leagueId]);
    if (stateResult.rows.length === 0) {
      res.json({ is_active: false, is_complete: false, current_pick: 1, league_id: leagueId });
      return;
    }
    res.json(stateResult.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch draft state' });
  }
});

// ── Scoped: POST /api/leagues/:leagueId/draft/start ──
router.post('/leagues/:leagueId/draft/start', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { leagueId } = req.params;
    await pool.query('DELETE FROM draft_state WHERE league_id = $1', [leagueId]);
    const result = await pool.query(
      'INSERT INTO draft_state (league_id, is_active, is_complete, current_pick) VALUES ($1, true, false, 1) RETURNING *',
      [leagueId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start draft' });
  }
});

// ── Scoped: POST /api/leagues/:leagueId/draft/pick ──
router.post('/leagues/:leagueId/draft/pick', async (req: Request, res: Response) => {
  try {
    const leagueId = parseInt(req.params.leagueId as string);
    const { team_id, player_id } = req.body;
    if (!team_id || !player_id) {
      res.status(400).json({ error: 'team_id and player_id are required' });
      return;
    }

    // Verify team belongs to this league
    const teamCheck = await pool.query('SELECT id FROM teams WHERE id = $1 AND league_id = $2', [team_id, leagueId]);
    if (teamCheck.rows.length === 0) {
      res.status(400).json({ error: 'Team not found in this league' });
      return;
    }

    // Check player isn't already drafted in this league
    const existing = await pool.query(`
      SELECT tp.id FROM team_players tp
      JOIN teams t ON t.id = tp.team_id
      WHERE tp.player_id = $1 AND t.league_id = $2
    `, [player_id, leagueId]);
    if (existing.rows.length > 0) {
      res.status(400).json({ error: 'Player already drafted in this league' });
      return;
    }

    // Get current pick number for this league
    const pickCount = await pool.query(`
      SELECT COUNT(*) FROM team_players tp
      JOIN teams t ON t.id = tp.team_id
      WHERE t.league_id = $1
    `, [leagueId]);
    const pickNumber = parseInt(pickCount.rows[0].count) + 1;

    await pool.query(
      'INSERT INTO team_players (team_id, player_id, pick_number) VALUES ($1, $2, $3)',
      [team_id, player_id, pickNumber]
    );

    // Update draft state
    await pool.query(
      'UPDATE draft_state SET current_pick = $1, updated_at = NOW() WHERE league_id = $2',
      [pickNumber + 1, leagueId]
    );

    // Check if draft is complete
    const castCount = await getCastCount(leagueId);
    if (pickNumber >= castCount) {
      await pool.query('UPDATE draft_state SET is_complete = true, is_active = false WHERE league_id = $1', [leagueId]);
    }

    res.json({ success: true, pick_number: pickNumber });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to make draft pick' });
  }
});

// ── Scoped: DELETE /api/leagues/:leagueId/draft/pick/:playerId ──
router.delete('/leagues/:leagueId/draft/pick/:playerId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { leagueId, playerId } = req.params;
    await pool.query(`
      DELETE FROM team_players WHERE player_id = $1
      AND team_id IN (SELECT id FROM teams WHERE league_id = $2)
    `, [playerId, leagueId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to undo draft pick' });
  }
});

// ── Scoped: POST /api/leagues/:leagueId/draft/reset ──
router.post('/leagues/:leagueId/draft/reset', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { leagueId } = req.params;
    await pool.query(`
      DELETE FROM team_players WHERE team_id IN (SELECT id FROM teams WHERE league_id = $1)
    `, [leagueId]);
    await pool.query(
      'UPDATE draft_state SET is_active = false, is_complete = false, current_pick = 1 WHERE league_id = $1',
      [leagueId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset draft' });
  }
});

// ── Legacy endpoints (backward compat) ──

router.get('/state', async (_req: Request, res: Response) => {
  try {
    const stateResult = await pool.query('SELECT * FROM draft_state LIMIT 1');
    if (stateResult.rows.length === 0) {
      res.json({ is_active: false, is_complete: false, current_pick: 1 });
      return;
    }
    res.json(stateResult.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch draft state' });
  }
});

router.post('/start', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const defaultLeague = await pool.query('SELECT id FROM leagues ORDER BY id LIMIT 1');
    const leagueId = defaultLeague.rows[0]?.id;
    await pool.query('DELETE FROM draft_state WHERE league_id = $1', [leagueId]);
    const result = await pool.query(
      'INSERT INTO draft_state (league_id, is_active, is_complete, current_pick) VALUES ($1, true, false, 1) RETURNING *',
      [leagueId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start draft' });
  }
});

router.post('/pick', async (req: Request, res: Response) => {
  try {
    const { team_id, player_id } = req.body;
    if (!team_id || !player_id) {
      res.status(400).json({ error: 'team_id and player_id are required' });
      return;
    }

    // Get the league for this team
    const teamResult = await pool.query('SELECT league_id FROM teams WHERE id = $1', [team_id]);
    if (teamResult.rows.length === 0) {
      res.status(400).json({ error: 'Team not found' });
      return;
    }
    const leagueId = teamResult.rows[0].league_id;

    // Check player isn't already drafted in this league
    const existing = await pool.query(`
      SELECT tp.id FROM team_players tp
      JOIN teams t ON t.id = tp.team_id
      WHERE tp.player_id = $1 AND t.league_id = $2
    `, [player_id, leagueId]);
    if (existing.rows.length > 0) {
      res.status(400).json({ error: 'Player already drafted' });
      return;
    }

    const pickCount = await pool.query(`
      SELECT COUNT(*) FROM team_players tp
      JOIN teams t ON t.id = tp.team_id
      WHERE t.league_id = $1
    `, [leagueId]);
    const pickNumber = parseInt(pickCount.rows[0].count) + 1;

    await pool.query(
      'INSERT INTO team_players (team_id, player_id, pick_number) VALUES ($1, $2, $3)',
      [team_id, player_id, pickNumber]
    );

    await pool.query(
      'UPDATE draft_state SET current_pick = $1, updated_at = NOW() WHERE league_id = $2',
      [pickNumber + 1, leagueId]
    );

    const castCount = await getCastCount(leagueId);
    if (pickNumber >= castCount) {
      await pool.query('UPDATE draft_state SET is_complete = true, is_active = false WHERE league_id = $1', [leagueId]);
    }

    res.json({ success: true, pick_number: pickNumber });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to make draft pick' });
  }
});

router.delete('/pick/:playerId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;
    await pool.query('DELETE FROM team_players WHERE player_id = $1', [playerId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to undo draft pick' });
  }
});

router.post('/reset', authMiddleware, async (_req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM team_players');
    await pool.query('UPDATE draft_state SET is_active = false, is_complete = false, current_pick = 1');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset draft' });
  }
});

export default router;
