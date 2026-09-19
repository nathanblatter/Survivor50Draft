import { Router, Request, Response } from 'express';
import pool from '../db';
import { getTeamsWithScores } from './teams';

const router = Router();

/**
 * GET /api/featured — the league the landing page should send people to:
 * the newest active, incomplete season and its first league.
 */
router.get('/featured', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT s.id as season_id, s.season_number, s.name as season_name, s.premiere_date, s.current_episode,
        sh.name as show_name, sh.slug as show_slug,
        l.id as league_id, l.name as league_name, l.invite_code
      FROM seasons s
      JOIN shows sh ON sh.id = s.show_id
      LEFT JOIN LATERAL (
        SELECT * FROM leagues WHERE season_id = s.id ORDER BY id LIMIT 1
      ) l ON true
      WHERE s.is_active AND NOT s.is_complete
      ORDER BY s.season_number DESC, s.id DESC
      LIMIT 1
    `);
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch featured league' });
  }
});

/**
 * GET /api/hall-of-fame — completed seasons with each league's champion.
 */
router.get('/hall-of-fame', async (_req: Request, res: Response) => {
  try {
    const leagues = await pool.query(`
      SELECT l.id as league_id, l.name as league_name, l.invite_code,
        s.id as season_id, s.season_number, s.name as season_name,
        sh.name as show_name, sh.slug as show_slug
      FROM leagues l
      JOIN seasons s ON s.id = l.season_id
      JOIN shows sh ON sh.id = s.show_id
      WHERE s.is_complete
      ORDER BY s.season_number DESC, l.id
    `);
    const out = [];
    for (const l of leagues.rows) {
      const teams = await getTeamsWithScores(l.league_id);
      if (teams.length === 0) continue;
      const winner = await pool.query(
        'SELECT name, photo_url FROM players WHERE season_id = $1 AND placement = 1 LIMIT 1',
        [l.season_id]
      );
      out.push({
        ...l,
        team_count: teams.length,
        champion: { id: teams[0].id, name: teams[0].name, owner_name: teams[0].owner_name, total_score: teams[0].total_score, players: teams[0].players },
        runner_up: teams[1] ? { id: teams[1].id, name: teams[1].name, owner_name: teams[1].owner_name, total_score: teams[1].total_score } : null,
        sole_survivor: winner.rows[0] || null,
      });
    }
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch hall of fame' });
  }
});

/**
 * GET /api/leagues/:leagueId/recap — everything the season recap page needs:
 * final standings, per-episode and cumulative team scores, rosters, draft order, highlights.
 */
router.get('/leagues/:leagueId/recap', async (req: Request, res: Response) => {
  try {
    const leagueId = parseInt(req.params.leagueId as string);
    const leagueRes = await pool.query(`
      SELECT l.*, s.season_number, s.name as season_name, s.cast_count, s.is_complete as season_complete,
        s.current_episode, sh.name as show_name, sh.slug as show_slug
      FROM leagues l JOIN seasons s ON s.id = l.season_id JOIN shows sh ON sh.id = s.show_id
      WHERE l.id = $1
    `, [leagueId]);
    if (leagueRes.rows.length === 0) {
      res.status(404).json({ error: 'League not found' });
      return;
    }
    const league = leagueRes.rows[0];
    const teams = await getTeamsWithScores(leagueId);

    // Team points per episode (events without an episode go into episode 0)
    const perEp = await pool.query(`
      SELECT t.id as team_id, COALESCE(se.episode, 0) as episode, SUM(se.points)::float as points
      FROM teams t
      JOIN team_players tp ON tp.team_id = t.id
      JOIN scoring_events se ON se.player_id = tp.player_id
      WHERE t.league_id = $1
      GROUP BY t.id, COALESCE(se.episode, 0)
    `, [leagueId]);
    const episodes = [...new Set(perEp.rows.map((r: any) => Number(r.episode)))].filter((e) => e > 0).sort((a, b) => a - b);
    const perEpisode: Record<number, Record<number, number>> = {};
    const cumulative: Record<number, Record<number, number>> = {};
    for (const t of teams) {
      perEpisode[t.id] = {};
      cumulative[t.id] = {};
      let running = perEp.rows.filter((r: any) => r.team_id === t.id && Number(r.episode) === 0).reduce((s: number, r: any) => s + r.points, 0);
      for (const ep of episodes) {
        const pts = perEp.rows.find((r: any) => r.team_id === t.id && Number(r.episode) === ep)?.points || 0;
        perEpisode[t.id][ep] = pts;
        running += pts;
        cumulative[t.id][ep] = running;
      }
    }

    // Highlights
    let biggestEpisode: { team_id: number; team_name: string; episode: number; points: number } | null = null;
    for (const t of teams) {
      for (const ep of episodes) {
        const pts = perEpisode[t.id][ep];
        if (!biggestEpisode || pts > biggestEpisode.points) {
          biggestEpisode = { team_id: t.id, team_name: t.name, episode: ep, points: pts };
        }
      }
    }
    const allPlayers = teams.flatMap((t: any) => t.players.map((p: any) => ({ ...p, team_name: t.name, team_id: t.id })));
    const mvp = allPlayers.length ? allPlayers.reduce((a: any, b: any) => (b.total_points > a.total_points ? b : a)) : null;
    const bust = allPlayers.length ? allPlayers.reduce((a: any, b: any) => (b.total_points < a.total_points ? b : a)) : null;
    const leaderByEpisode = episodes.map((ep) => {
      const best = teams.reduce((a: any, b: any) => (cumulative[b.id][ep] > cumulative[a.id][ep] ? b : a));
      return { episode: ep, team_id: best.id };
    });
    const weeksLed: Record<number, number> = {};
    for (const l of leaderByEpisode) weeksLed[l.team_id] = (weeksLed[l.team_id] || 0) + 1;

    const recaps = await pool.query(`
      SELECT tr.team_id, tr.recap FROM team_recaps tr JOIN teams t ON t.id = tr.team_id WHERE t.league_id = $1
    `, [leagueId]);

    res.json({
      league,
      standings: teams.map((t: any, i: number) => ({
        ...t,
        rank: i + 1,
        weeks_led: weeksLed[t.id] || 0,
        best_episode: episodes.reduce((best: any, ep) => (perEpisode[t.id][ep] > (best?.points ?? -Infinity) ? { episode: ep, points: perEpisode[t.id][ep] } : best), null),
      })),
      episodes,
      per_episode: perEpisode,
      cumulative,
      highlights: {
        biggest_episode: biggestEpisode,
        mvp: mvp ? { id: mvp.id, name: mvp.name, team_name: mvp.team_name, team_id: mvp.team_id, total_points: mvp.total_points, placement: mvp.placement, photo_url: mvp.photo_url } : null,
        bust: bust ? { id: bust.id, name: bust.name, team_name: bust.team_name, team_id: bust.team_id, total_points: bust.total_points, placement: bust.placement, photo_url: bust.photo_url } : null,
        margin: teams.length > 1 ? teams[0].total_score - teams[1].total_score : 0,
      },
      recaps: Object.fromEntries(recaps.rows.map((r: any) => [r.team_id, r.recap])),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to build recap' });
  }
});

export default router;
