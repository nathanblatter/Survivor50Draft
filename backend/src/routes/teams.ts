import { Router, Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/** Teams in a league with rosters and total scores, sorted by score. */
export async function getTeamsWithScores(leagueId: number) {
  const teamsResult = await pool.query(
    'SELECT * FROM teams t WHERE t.league_id = $1 ORDER BY t.draft_order NULLS LAST, t.id',
    [leagueId]
  );
  const playersResult = await pool.query(`
    SELECT p.*, tp.team_id, tp.pick_number,
      COALESCE((SELECT SUM(se.points) FROM scoring_events se WHERE se.player_id = p.id), 0)::float as total_points
    FROM team_players tp
    JOIN teams t ON t.id = tp.team_id
    JOIN players p ON p.id = tp.player_id
    WHERE t.league_id = $1
    ORDER BY tp.pick_number
  `, [leagueId]);

  const byTeam = new Map<number, any[]>();
  for (const p of playersResult.rows) {
    if (!byTeam.has(p.team_id)) byTeam.set(p.team_id, []);
    byTeam.get(p.team_id)!.push(p);
  }

  const teams = teamsResult.rows.map((team: any) => {
    const players = byTeam.get(team.id) || [];
    const total_score = players.reduce((sum: number, p: any) => sum + (p.total_points || 0), 0);
    return { ...team, players, total_score };
  });
  teams.sort((a: any, b: any) => b.total_score - a.total_score);
  return teams;
}

// ── GET /api/leagues/:leagueId/teams ──
router.get('/leagues/:leagueId/teams', async (req: Request, res: Response) => {
  try {
    const leagueId = parseInt(req.params.leagueId as string);
    res.json(await getTeamsWithScores(leagueId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// ── POST /api/leagues/:leagueId/teams (public — league members create their own team) ──
router.post('/leagues/:leagueId/teams', async (req: Request, res: Response) => {
  try {
    const { leagueId } = req.params;
    const { name, owner_name, draft_order } = req.body;
    if (!name || !owner_name) {
      res.status(400).json({ error: 'name and owner_name are required' });
      return;
    }
    const league = await pool.query('SELECT id FROM leagues WHERE id = $1', [leagueId]);
    if (league.rows.length === 0) {
      res.status(404).json({ error: 'League not found' });
      return;
    }
    const result = await pool.query(
      'INSERT INTO teams (league_id, name, owner_name, draft_order) VALUES ($1, $2, $3, $4) RETURNING *',
      [leagueId, String(name).trim(), String(owner_name).trim(), draft_order || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

// ── GET /api/teams/:id ──
router.get('/teams/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const teamResult = await pool.query('SELECT * FROM teams WHERE id = $1', [id]);
    if (teamResult.rows.length === 0) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    const playersResult = await pool.query(`
      SELECT p.*, tp.pick_number,
        COALESCE((SELECT SUM(se.points) FROM scoring_events se WHERE se.player_id = p.id), 0)::float as total_points
      FROM team_players tp
      JOIN players p ON p.id = tp.player_id
      WHERE tp.team_id = $1
      ORDER BY tp.pick_number
    `, [id]);
    const eventsResult = await pool.query(`
      SELECT se.*, p.name as player_name
      FROM scoring_events se
      JOIN players p ON p.id = se.player_id
      JOIN team_players tp ON tp.player_id = p.id
      WHERE tp.team_id = $1
      ORDER BY se.episode DESC NULLS LAST, se.created_at DESC
    `, [id]);
    const recapResult = await pool.query('SELECT recap, generated_at FROM team_recaps WHERE team_id = $1', [id]);
    const total_score = playersResult.rows.reduce((sum: number, p: any) => sum + (p.total_points || 0), 0);
    res.json({
      ...teamResult.rows[0],
      players: playersResult.rows,
      events: eventsResult.rows,
      total_score,
      recap: recapResult.rows[0]?.recap || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

router.patch('/teams/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, owner_name, draft_order } = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (name) { fields.push(`name = $${idx++}`); values.push(name); }
    if (owner_name) { fields.push(`owner_name = $${idx++}`); values.push(owner_name); }
    if (draft_order !== undefined) { fields.push(`draft_order = $${idx++}`); values.push(draft_order || null); }
    if (fields.length === 0) {
      res.status(400).json({ error: 'Provide name, owner_name, or draft_order to update' });
      return;
    }
    values.push(id);
    const result = await pool.query(
      `UPDATE teams SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update team' });
  }
});

router.delete('/teams/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM teams WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

export default router;
