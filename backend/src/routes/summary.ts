import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import pool from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Get list of episodes that have scoring events
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

// Get all scoring events for a specific episode
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

// Generate AI episode summary
router.post('/generate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { episode } = req.body;
    if (!episode) {
      res.status(400).json({ error: 'episode is required' });
      return;
    }

    // Get all scoring events for this episode with player + team info
    const eventsResult = await pool.query(`
      SELECT
        se.event_type, se.points, se.notes,
        p.name as player_name, p.tribe, p.is_eliminated,
        t.name as team_name, t.owner_name as team_owner
      FROM scoring_events se
      JOIN players p ON p.id = se.player_id
      LEFT JOIN team_players tp ON tp.player_id = p.id
      LEFT JOIN teams t ON t.id = tp.team_id
      WHERE se.episode = $1
      ORDER BY se.created_at ASC
    `, [episode]);

    if (eventsResult.rows.length === 0) {
      res.status(404).json({ error: 'No scoring events found for this episode' });
      return;
    }

    // Get team standings for context
    const standingsResult = await pool.query(`
      SELECT t.name as team_name, t.owner_name,
        COALESCE(SUM(se.points), 0) as total_score
      FROM teams t
      LEFT JOIN team_players tp ON tp.team_id = t.id
      LEFT JOIN scoring_events se ON se.player_id = tp.player_id
      GROUP BY t.id, t.name, t.owner_name
      ORDER BY total_score DESC
    `);

    // Get episode-specific point totals per team
    const epTeamResult = await pool.query(`
      SELECT t.name as team_name, t.owner_name,
        COALESCE(SUM(se.points), 0) as ep_score
      FROM teams t
      LEFT JOIN team_players tp ON tp.team_id = t.id
      LEFT JOIN scoring_events se ON se.player_id = tp.player_id AND se.episode = $1
      GROUP BY t.id, t.name, t.owner_name
      ORDER BY ep_score DESC
    `, [episode]);

    // Get game state: active idols, advantages, alliances
    const [idolsResult, advantagesResult, alliancesResult, eliminatedResult] = await Promise.all([
      pool.query(`
        SELECT gi.*, p.name as player_name FROM game_idols gi
        JOIN players p ON p.id = gi.player_id
        ORDER BY gi.is_active DESC
      `),
      pool.query(`
        SELECT ga.*, p.name as player_name FROM game_advantages ga
        JOIN players p ON p.id = ga.player_id
        ORDER BY ga.is_active DESC
      `),
      pool.query(`
        SELECT a.*, json_agg(p.name) FILTER (WHERE p.id IS NOT NULL) as member_names
        FROM alliances a
        LEFT JOIN alliance_members am ON am.alliance_id = a.id
        LEFT JOIN players p ON p.id = am.player_id
        WHERE a.is_active = true
        GROUP BY a.id
      `),
      pool.query(`
        SELECT name, placement FROM players WHERE is_eliminated = true ORDER BY placement DESC
      `),
    ]);

    const events = eventsResult.rows;
    const standings = standingsResult.rows;
    const epTeamScores = epTeamResult.rows;

    // Build the event summary for the prompt
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

    // Build game state context
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

    const prompt = `You are the official recap writer for the Survivor 50 Fantasy Draft League. Your job is to write an entertaining, dramatic, and funny episode summary that the league commissioner will send to all league members via group chat.

This is Season 50 of Survivor, the biggest season ever — all returning legends. The fantasy league has teams of drafted players, and managers earn points based on their players' in-game performance.

Here are the scoring events from Episode ${episode}:

${eventLines}

Fantasy points earned by each team this episode:
${epScoresText}

Overall league standings after this episode:
${standingsText}
${gameStateText ? `\nCurrent game state:${gameStateText}` : ''}

Write a vivid, entertaining recap of Episode ${episode}. Guidelines:
- Be dramatic and funny — channel Jeff Probst energy mixed with sports commentator hype
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

    // Extract text from response
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

export default router;
