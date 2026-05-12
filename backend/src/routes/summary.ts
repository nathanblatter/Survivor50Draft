import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import pool from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ── Scoped: GET /api/leagues/:leagueId/summary/episodes ──
router.get('/leagues/:leagueId/summary/episodes', async (req: Request, res: Response) => {
  try {
    const { leagueId } = req.params;
    // Get season_id from league
    const leagueResult = await pool.query('SELECT season_id FROM leagues WHERE id = $1', [leagueId]);
    if (leagueResult.rows.length === 0) {
      res.status(404).json({ error: 'League not found' });
      return;
    }
    const seasonId = leagueResult.rows[0].season_id;

    const result = await pool.query(`
      SELECT DISTINCT se.episode, COUNT(*) as event_count
      FROM scoring_events se
      JOIN players p ON p.id = se.player_id
      WHERE se.episode IS NOT NULL AND p.season_id = $1
      GROUP BY se.episode
      ORDER BY se.episode
    `, [seasonId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch episodes' });
  }
});

// ── Scoped: GET /api/leagues/:leagueId/summary/episodes/:ep ──
router.get('/leagues/:leagueId/summary/episodes/:ep', async (req: Request, res: Response) => {
  try {
    const { leagueId, ep } = req.params;
    const leagueResult = await pool.query('SELECT season_id FROM leagues WHERE id = $1', [leagueId]);
    if (leagueResult.rows.length === 0) {
      res.status(404).json({ error: 'League not found' });
      return;
    }
    const seasonId = leagueResult.rows[0].season_id;

    const result = await pool.query(`
      SELECT se.*, p.name as player_name, p.tribe, p.is_eliminated
      FROM scoring_events se
      JOIN players p ON p.id = se.player_id
      WHERE se.episode = $1 AND p.season_id = $2
      ORDER BY se.created_at ASC
    `, [ep, seasonId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch episode events' });
  }
});

// ── Scoped: POST /api/leagues/:leagueId/summary/generate ──
router.post('/leagues/:leagueId/summary/generate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { leagueId } = req.params;
    const { episode } = req.body;
    if (!episode) {
      res.status(400).json({ error: 'episode is required' });
      return;
    }

    // Get league context
    const leagueResult = await pool.query(`
      SELECT l.*, s.season_number, s.name as season_name, s.cast_count,
        sh.name as show_name, sh.slug as show_slug
      FROM leagues l
      JOIN seasons s ON s.id = l.season_id
      JOIN shows sh ON sh.id = s.show_id
      WHERE l.id = $1
    `, [leagueId]);
    if (leagueResult.rows.length === 0) {
      res.status(404).json({ error: 'League not found' });
      return;
    }
    const league = leagueResult.rows[0];
    const seasonId = league.season_id;
    const showName = league.show_name;
    const seasonNum = league.season_number;

    // Get scoring events scoped to this league's teams
    const eventsResult = await pool.query(`
      SELECT
        se.event_type, se.points, se.notes,
        p.name as player_name, p.tribe, p.is_eliminated,
        t.name as team_name, t.owner_name as team_owner
      FROM scoring_events se
      JOIN players p ON p.id = se.player_id
      LEFT JOIN team_players tp ON tp.player_id = p.id
      LEFT JOIN teams t ON t.id = tp.team_id AND t.league_id = $1
      WHERE se.episode = $2 AND p.season_id = $3
      ORDER BY se.created_at ASC
    `, [leagueId, episode, seasonId]);

    if (eventsResult.rows.length === 0) {
      res.status(404).json({ error: 'No scoring events found for this episode' });
      return;
    }

    // Get standings for this league
    const standingsResult = await pool.query(`
      SELECT t.name as team_name, t.owner_name,
        COALESCE(SUM(se.points), 0) as total_score
      FROM teams t
      LEFT JOIN team_players tp ON tp.team_id = t.id
      LEFT JOIN scoring_events se ON se.player_id = tp.player_id
      WHERE t.league_id = $1
      GROUP BY t.id, t.name, t.owner_name
      ORDER BY total_score DESC
    `, [leagueId]);

    const epTeamResult = await pool.query(`
      SELECT t.name as team_name, t.owner_name,
        COALESCE(SUM(se.points), 0) as ep_score
      FROM teams t
      LEFT JOIN team_players tp ON tp.team_id = t.id
      LEFT JOIN scoring_events se ON se.player_id = tp.player_id AND se.episode = $1
      WHERE t.league_id = $2
      GROUP BY t.id, t.name, t.owner_name
      ORDER BY ep_score DESC
    `, [episode, leagueId]);

    const [idolsResult, advantagesResult, alliancesResult, eliminatedResult] = await Promise.all([
      pool.query(`
        SELECT gi.*, p.name as player_name FROM game_idols gi
        JOIN players p ON p.id = gi.player_id
        WHERE gi.season_id = $1
        ORDER BY gi.is_active DESC
      `, [seasonId]),
      pool.query(`
        SELECT ga.*, p.name as player_name FROM game_advantages ga
        JOIN players p ON p.id = ga.player_id
        WHERE ga.season_id = $1
        ORDER BY ga.is_active DESC
      `, [seasonId]),
      pool.query(`
        SELECT a.*, json_agg(p.name) FILTER (WHERE p.id IS NOT NULL) as member_names
        FROM alliances a
        LEFT JOIN alliance_members am ON am.alliance_id = a.id
        LEFT JOIN players p ON p.id = am.player_id
        WHERE a.is_active = true AND a.season_id = $1
        GROUP BY a.id
      `, [seasonId]),
      pool.query(`
        SELECT name, placement FROM players
        WHERE is_eliminated = true AND season_id = $1
        ORDER BY placement DESC
      `, [seasonId]),
    ]);

    const events = eventsResult.rows;
    const standings = standingsResult.rows;
    const epTeamScores = epTeamResult.rows;

    const eventLines = events.map((e: any) => {
      const pts = e.points > 0 ? `+${e.points}` : `${e.points}`;
      const teamInfo = e.team_name ? ` (on ${e.team_name}, managed by ${e.team_owner})` : ' (undrafted)';
      const noteInfo = e.notes ? ` — "${e.notes}"` : '';
      return `• ${e.player_name} [${e.tribe}]${teamInfo}: ${e.event_type.replace(/_/g, ' ')} (${pts} pts)${noteInfo}`;
    }).join('\n');

    const standingsText = standings.map((s: any, i: number) =>
      `${i + 1}. ${s.team_name} (${s.owner_name}): ${parseFloat(s.total_score).toFixed(1)} pts`
    ).join('\n');

    const epScoresText = epTeamScores.map((s: any) =>
      `• ${s.team_name} (${s.owner_name}): ${parseFloat(s.ep_score).toFixed(1)} pts this episode`
    ).join('\n');

    const activeIdols = idolsResult.rows.filter((i: any) => i.is_active);
    const playedIdols = idolsResult.rows.filter((i: any) => !i.is_active && i.played_episode == episode);
    const activeAdvantages = advantagesResult.rows.filter((a: any) => a.is_active);
    const playedAdvantages = advantagesResult.rows.filter((a: any) => !a.is_active && a.played_episode == episode);
    const activeAlliances = alliancesResult.rows;
    const bootOrder = eliminatedResult.rows;

    let gameStateText = '';
    if (activeIdols.length > 0) {
      gameStateText += '\nIdols currently in play:\n' + activeIdols.map((i: any) =>
        `• ${i.player_name} has a ${i.label} (found ep ${i.found_episode}${i.notes ? `, ${i.notes}` : ''})`
      ).join('\n');
    }
    if (playedIdols.length > 0) {
      gameStateText += '\nIdols played this episode:\n' + playedIdols.map((i: any) =>
        `• ${i.player_name} played their ${i.label}${i.notes ? ` (${i.notes})` : ''}`
      ).join('\n');
    }
    if (activeAdvantages.length > 0) {
      gameStateText += '\nAdvantages currently in play:\n' + activeAdvantages.map((a: any) =>
        `• ${a.player_name} has ${a.advantage_type} (found ep ${a.found_episode}${a.notes ? `, ${a.notes}` : ''})`
      ).join('\n');
    }
    if (playedAdvantages.length > 0) {
      gameStateText += '\nAdvantages used this episode:\n' + playedAdvantages.map((a: any) =>
        `• ${a.player_name} used their ${a.advantage_type}${a.notes ? ` (${a.notes})` : ''}`
      ).join('\n');
    }
    if (activeAlliances.length > 0) {
      gameStateText += '\nKnown alliances:\n' + activeAlliances.map((a: any) =>
        `• "${a.name}" — members: ${(a.member_names || []).join(', ')}${a.notes ? ` (${a.notes})` : ''}`
      ).join('\n');
    }
    if (bootOrder.length > 0) {
      gameStateText += '\nEliminated players (most recent first):\n' + bootOrder.map((p: any) =>
        `• ${p.name} (placed ${p.placement})`
      ).join('\n');
    }

    const prompt = `You are the official recap writer for the ${showName} ${seasonNum} Fantasy Draft League. Your job is to write an entertaining, dramatic, and funny episode summary that the league commissioner will send to all league members via group chat.

This is Season ${seasonNum} of ${showName}. The fantasy league has teams of drafted players, and managers earn points based on their players' in-game performance.

Here are the scoring events from Episode ${episode}:

${eventLines}

Fantasy points earned by each team this episode:
${epScoresText}

Overall league standings after this episode:
${standingsText}
${gameStateText ? `\nCurrent game state:${gameStateText}` : ''}

Write a vivid, entertaining recap of Episode ${episode}. Guidelines:
- Be dramatic and funny — channel host energy mixed with sports commentator hype
- Reference specific players and what they did using the scoring events above
- Call out fantasy managers by name — celebrate winners and roast those who had a bad week
- If any idols or advantages were played this episode, make that a dramatic highlight
- If someone is sitting on an idol or advantage, tease the suspense of when they'll use it
- Reference alliance dynamics if relevant — who's working together, who got blindsided
- Include fun section headers (use emojis)
- End with updated standings and a hype line for next week
- Keep it between 400-600 words
- Use emojis liberally
- Make it feel like a group chat message, not an essay — fun, punchy, shareable`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
      return;
    }

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const summary = message.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('\n');

    res.json({
      episode,
      summary,
      event_count: events.length,
    });
  } catch (err: any) {
    console.error('Summary generation error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate summary' });
  }
});

// ── Scoped: POST /api/leagues/:leagueId/teams/:teamId/recap/generate ──
router.post('/leagues/:leagueId/teams/:teamId/recap/generate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { leagueId, teamId } = req.params;

    // Get league + season + show context
    const leagueResult = await pool.query(`
      SELECT l.*, s.season_number, s.name as season_name, s.cast_count,
        sh.name as show_name, sh.slug as show_slug
      FROM leagues l
      JOIN seasons s ON s.id = l.season_id
      JOIN shows sh ON sh.id = s.show_id
      WHERE l.id = $1
    `, [leagueId]);
    if (leagueResult.rows.length === 0) {
      res.status(404).json({ error: 'League not found' });
      return;
    }
    const league = leagueResult.rows[0];

    // Get team info + players
    const teamResult = await pool.query('SELECT * FROM teams WHERE id = $1 AND league_id = $2', [teamId, leagueId]);
    if (teamResult.rows.length === 0) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    const team = teamResult.rows[0];

    const playersResult = await pool.query(`
      SELECT p.*, tp.pick_number,
        COALESCE((SELECT SUM(se.points) FROM scoring_events se WHERE se.player_id = p.id), 0) as total_points
      FROM team_players tp
      JOIN players p ON p.id = tp.player_id
      WHERE tp.team_id = $1
      ORDER BY tp.pick_number
    `, [teamId]);

    if (playersResult.rows.length === 0) {
      res.status(400).json({ error: 'This team has no players' });
      return;
    }
    const players = playersResult.rows;
    const playerIds = players.map((p: any) => p.id);

    // Get all scoring events for these players across the full season
    const eventsResult = await pool.query(`
      SELECT se.*, p.name as player_name, p.tribe, p.placement, p.is_eliminated
      FROM scoring_events se
      JOIN players p ON p.id = se.player_id
      WHERE se.player_id = ANY($1)
      ORDER BY se.episode ASC NULLS LAST, se.created_at ASC
    `, [playerIds]);
    const events = eventsResult.rows;

    // Get league standings for context
    const standingsResult = await pool.query(`
      SELECT t.name as team_name, t.owner_name,
        COALESCE(SUM(se.points), 0) as total_score
      FROM teams t
      LEFT JOIN team_players tp ON tp.team_id = t.id
      LEFT JOIN scoring_events se ON se.player_id = tp.player_id
      WHERE t.league_id = $1
      GROUP BY t.id, t.name, t.owner_name
      ORDER BY total_score DESC
    `, [leagueId]);
    const standings = standingsResult.rows;
    const teamRank = standings.findIndex((s: any) => s.team_name === team.name) + 1;
    const teamTotalScore = standings.find((s: any) => s.team_name === team.name)?.total_score || 0;

    // Build per-player summaries
    const playerSummaries = players.map((p: any) => {
      const playerEvents = events.filter((e: any) => e.player_id === p.id);
      const byType: Record<string, number> = {};
      for (const e of playerEvents) {
        byType[e.event_type] = (byType[e.event_type] || 0) + 1;
      }
      const eventLines = playerEvents.map((e: any) => {
        const pts = e.points > 0 ? `+${e.points}` : `${e.points}`;
        const epInfo = e.episode ? ` [Ep ${e.episode}]` : '';
        const noteInfo = e.notes ? ` — "${e.notes}"` : '';
        return `    • ${e.event_type.replace(/_/g, ' ')} (${pts} pts)${epInfo}${noteInfo}`;
      }).join('\n');
      const statusLine = p.is_eliminated
        ? `Eliminated (finished ${p.placement}${getOrdinalSuffix(p.placement)})`
        : 'Still in the game';
      return `${p.name} (pick #${p.pick_number}, tribe: ${p.tribe}) — ${statusLine} — ${parseFloat(p.total_points).toFixed(1)} pts total\n${eventLines || '    (no scoring events)'}`;
    }).join('\n\n');

    const standingsText = standings.map((s: any, i: number) =>
      `${i + 1}. ${s.team_name} (${s.owner_name}): ${parseFloat(s.total_score).toFixed(1)} pts`
    ).join('\n');

    const prompt = `You are writing end-of-season fantasy recap cards for the ${league.show_name} Season ${league.season_number} Fantasy Draft League.

Write a personalized, entertaining end-of-season recap for the team "${team.name}" managed by ${team.owner_name}. They finished ${teamRank}${getOrdinalSuffix(teamRank)} place in the league with ${parseFloat(teamTotalScore).toFixed(1)} total points.

Here are their drafted players and every scoring event from the season:

${playerSummaries}

Full final standings:
${standingsText}

Write a fun, narrative end-of-season recap for this team. Guidelines:
- Address ${team.owner_name} directly
- Highlight each player's season story — who was their hero, who disappointed, who surprised
- Call out notable moments: challenge wins, idols found/played, big vote moments, survival longevity
- Reference their finishing position with appropriate energy (winner hype, runner-up heartbreak, last place roast, etc.)
- Mention their best pick and (if applicable) their worst pick
- Keep it between 300-500 words
- Use emojis and make it fun and shareable
- End with a hype line for next season`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
      return;
    }

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const recap = message.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('\n');

    res.json({ team_name: team.name, owner_name: team.owner_name, rank: teamRank, total_score: teamTotalScore, recap });
  } catch (err: any) {
    console.error('Team recap generation error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate team recap' });
  }
});

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ── Legacy endpoints ──

router.get('/episodes', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT episode, COUNT(*) as event_count
      FROM scoring_events
      WHERE episode IS NOT NULL
      GROUP BY episode
      ORDER BY episode
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch episodes' });
  }
});

router.get('/episodes/:ep', async (req: Request, res: Response) => {
  try {
    const { ep } = req.params;
    const result = await pool.query(`
      SELECT se.*, p.name as player_name, p.tribe, p.is_eliminated
      FROM scoring_events se
      JOIN players p ON p.id = se.player_id
      WHERE se.episode = $1
      ORDER BY se.created_at ASC
    `, [ep]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch episode events' });
  }
});

router.post('/generate', authMiddleware, async (req: Request, res: Response) => {
  // Redirect to the first league's scoped endpoint
  try {
    const defaultLeague = await pool.query('SELECT id FROM leagues ORDER BY id LIMIT 1');
    if (defaultLeague.rows.length === 0) {
      res.status(400).json({ error: 'No leagues exist' });
      return;
    }
    // Rewrite the request to use the scoped handler
    req.params.leagueId = defaultLeague.rows[0].id.toString();
    // Forward to the scoped handler by calling it directly won't work easily,
    // so we'll duplicate the core logic here for backward compat
    const { episode } = req.body;
    if (!episode) {
      res.status(400).json({ error: 'episode is required' });
      return;
    }
    res.status(400).json({ error: 'Please use /api/leagues/:leagueId/summary/generate instead' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

export default router;
