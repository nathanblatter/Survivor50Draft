import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  if (req.headers['x-kpi-api-key'] !== process.env.KPI_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const [leaguesRes, sessionsRes, draftsRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) AS total_leagues
        FROM leagues
        WHERE created_at > NOW() - INTERVAL '90 days'
      `),
      pool.query(`
        SELECT COUNT(*) AS sessions_7d
        FROM user_sessions
        WHERE logged_in_at > NOW() - INTERVAL '7 days'
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE is_complete = true)::float
          / NULLIF(COUNT(*), 0) AS draft_completion_rate
        FROM draft_state
        WHERE updated_at > NOW() - INTERVAL '90 days'
      `),
    ]);

    const l = leaguesRes.rows[0] || {};
    const sess = sessionsRes.rows[0] || {};
    const d = draftsRes.rows[0] || {};

    return res.json({
      project: 'survivor50draft',
      generated_at: new Date().toISOString(),
      kpis: {
        total_leagues: { value: parseInt(l.total_leagues || 0), label: 'Total Leagues (90d)', unit: 'leagues' },
        draft_completion_rate: { value: parseFloat((parseFloat(d.draft_completion_rate || 0) * 100).toFixed(1)), label: 'Draft Completion Rate', unit: '%' },
        weekly_active_sessions: { value: parseInt(sess.sessions_7d || 0), label: 'Weekly Active Sessions', unit: 'sessions' },
      }
    });
  } catch (err) {
    console.error('KPI error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
