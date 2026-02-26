import { Router, Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const teamsResult = await pool.query('SELECT * FROM teams ORDER BY draft_order, id');
    const teams = [];

    for (const team of teamsResult.rows) {
      const playersResult = await pool.query(`
        SELECT p.*, tp.pick_number,
          COALESCE(
            (SELECT SUM(se.points) FROM scoring_events se WHERE se.player_id = p.id), 0
          ) as total_points
        FROM team_players tp
        JOIN players p ON p.id = tp.player_id
        WHERE tp.team_id = $1
        ORDER BY tp.pick_number
      `, [team.id]);

      const totalScore = playersResult.rows.reduce(
        (sum: number, p: any) => sum + parseFloat(p.total_points || 0), 0
      );

      teams.push({
        ...team,
        players: playersResult.rows,
        total_score: totalScore,
      });
    }

    teams.sort((a, b) => b.total_score - a.total_score);
    res.json(teams);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const teamResult = await pool.query('SELECT * FROM teams WHERE id = $1', [id]);
    if (teamResult.rows.length === 0) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const playersResult = await pool.query(`
      SELECT p.*, tp.pick_number,
        COALESCE(
          (SELECT SUM(se.points) FROM scoring_events se WHERE se.player_id = p.id), 0
        ) as total_points
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
      ORDER BY se.created_at DESC
    `, [id]);

    const totalScore = playersResult.rows.reduce(
      (sum: number, p: any) => sum + parseFloat(p.total_points || 0), 0
    );

    res.json({
      ...teamResult.rows[0],
      players: playersResult.rows,
      events: eventsResult.rows,
      total_score: totalScore,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

// Public: anyone can create a team (for draft setup with friends)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, owner_name, draft_order } = req.body;
    if (!name || !owner_name) {
      res.status(400).json({ error: 'name and owner_name are required' });
      return;
    }
    const result = await pool.query(
      'INSERT INTO teams (name, owner_name, draft_order) VALUES ($1, $2, $3) RETURNING *',
      [name, owner_name, draft_order || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, owner_name } = req.body;
    if (!name && !owner_name) {
      res.status(400).json({ error: 'Provide name or owner_name to update' });
      return;
    }
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (name) { fields.push(`name = $${idx++}`); values.push(name); }
    if (owner_name) { fields.push(`owner_name = $${idx++}`); values.push(owner_name); }
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

router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM teams WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

export default router;
