import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import pool from '../db';
import { authMiddleware } from '../middleware/auth';

/**
 * Scoring extraction: turn episode recaps (EW, Parade, Wikipedia, or pasted notes) into
 * *proposed* scoring events for the commissioner to review. Nothing is written here —
 * the admin confirms and the batch endpoint commits.
 */
const router = Router();
const MODEL = 'claude-opus-5';

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['events', 'eliminated', 'alliances', 'summary', 'warnings'],
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['player', 'event_type', 'count', 'evidence', 'confidence'],
        properties: {
          player: { type: 'string', description: 'Exact cast name from the roster' },
          event_type: { type: 'string', description: 'Exact event_type from the rules list' },
          count: { type: 'integer', description: 'How many times it applies (e.g. votes received), at least 1' },
          evidence: { type: 'string', description: 'Short quote or paraphrase from the source' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
    eliminated: {
      type: 'array',
      description: 'Players voted out or otherwise eliminated this episode, in boot order',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['player', 'votes_received', 'had_idol', 'how'],
        properties: {
          player: { type: 'string' },
          votes_received: { type: 'integer' },
          had_idol: { type: 'boolean', description: 'Went home holding an unplayed idol' },
          how: { type: 'string', description: 'voted out / medevac / quit / fire-making / rocks' },
        },
      },
    },
    alliances: {
      type: 'array',
      description: 'Alliances, voting blocs and named pairs/trios shown this episode (new, changed or broken)',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'members', 'status', 'evidence', 'confidence'],
        properties: {
          name: { type: 'string', description: 'The name used on screen or in the recap, or a short descriptive one (e.g. "Devin / Brady bromance")' },
          members: { type: 'array', items: { type: 'string' }, description: 'Exact cast names, at least 2' },
          status: { type: 'string', enum: ['new', 'updated', 'dissolved'], description: 'new = first seen this episode; updated = an existing alliance whose members changed; dissolved = broke up this episode' },
          evidence: { type: 'string', description: 'Short quote or paraphrase from the source' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
    summary: { type: 'string', description: '2-4 sentence factual summary of the episode' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Anything ambiguous or unverifiable that the commissioner should check' },
  },
} as const;

interface Extracted {
  events: { player: string; event_type: string; count: number; evidence: string; confidence: 'high' | 'medium' | 'low' }[];
  eliminated: { player: string; votes_received: number; had_idol: boolean; how: string }[];
  alliances: { name: string; members: string[]; status: 'new' | 'updated' | 'dissolved'; evidence: string; confidence: 'high' | 'medium' | 'low' }[];
  summary: string;
  warnings: string[];
}

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
}

/** Resolve a name from the article to a player id: exact, nickname, first name, then loose. */
function resolvePlayer(name: string, players: { id: number; name: string; nickname: string | null }[]) {
  const n = normalize(name);
  if (!n) return null;
  const exact = players.find(p => normalize(p.name) === n || (p.nickname && normalize(p.nickname) === n));
  if (exact) return exact;
  const first = players.filter(p => normalize(p.name).split(' ')[0] === n.split(' ')[0]);
  if (first.length === 1) return first[0];
  const loose = players.filter(p => normalize(p.name).includes(n) || n.includes(normalize(p.name).split(' ')[0]));
  return loose.length === 1 ? loose[0] : null;
}

// POST /api/seasons/:seasonId/scoring/extract  { episode, urls?: string[], text?: string }
router.post('/seasons/:seasonId/scoring/extract', authMiddleware, async (req: Request, res: Response) => {
  const seasonId = parseInt(req.params.seasonId as string);
  const { episode, urls = [], text = '' } = req.body || {};
  if (!episode) { res.status(400).json({ error: 'episode is required' }); return; }
  const cleanUrls: string[] = (Array.isArray(urls) ? urls : []).map((u: string) => String(u).trim()).filter((u: string) => /^https?:\/\//i.test(u)).slice(0, 6);
  if (cleanUrls.length === 0 && !String(text).trim()) { res.status(400).json({ error: 'Provide at least one article URL or pasted text' }); return; }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' }); return; }

  try {
    const seasonRes = await pool.query(`
      SELECT s.*, sh.name as show_name FROM seasons s JOIN shows sh ON sh.id = s.show_id WHERE s.id = $1
    `, [seasonId]);
    if (seasonRes.rows.length === 0) { res.status(404).json({ error: 'Season not found' }); return; }
    const season = seasonRes.rows[0];
    const playersRes = await pool.query(`
      SELECT p.id, p.name, p.nickname, p.tribe, p.is_eliminated, p.placement,
        (SELECT t.name FROM tribe_history th JOIN tribes t ON t.id = th.tribe_id WHERE th.player_id = p.id ORDER BY th.id LIMIT 1) as original_tribe
      FROM players p WHERE p.season_id = $1 ORDER BY p.name`, [seasonId]);
    const players = playersRes.rows;
    const rulesRes = await pool.query('SELECT event_type, points, description, is_variable FROM scoring_rules WHERE show_id = $1 ORDER BY id', [season.show_id]);
    const rules = rulesRes.rows;
    const tribesRes = await pool.query('SELECT name FROM tribes WHERE season_id = $1 AND is_active', [seasonId]);
    const alliancesRes = await pool.query(`
      SELECT a.id, a.name, a.is_active, a.formed_episode,
        COALESCE(array_agg(p.name ORDER BY p.name) FILTER (WHERE p.id IS NOT NULL), '{}') as members
      FROM alliances a
      LEFT JOIN alliance_members am ON am.alliance_id = a.id
      LEFT JOIN players p ON p.id = am.player_id
      WHERE a.season_id = $1 GROUP BY a.id ORDER BY a.id`, [seasonId]);
    const knownAlliances: { id: number; name: string; is_active: boolean; formed_episode: number | null; members: string[] }[] = alliancesRes.rows;

    const roster = players.map((p: any) => `- ${p.name}${p.nickname ? ` ("${p.nickname}")` : ''} — current tribe ${p.tribe}${p.original_tribe && p.original_tribe !== p.tribe ? `, started on ${p.original_tribe}` : ''}${p.is_eliminated ? ` (already out, placed ${p.placement})` : ''}`).join('\n');
    const ruleList = rules.map((r: any) => `- ${r.event_type}: ${r.description} (${r.is_variable ? 'variable' : `${parseFloat(r.points) > 0 ? '+' : ''}${parseFloat(r.points)}`})`).join('\n');
    const allianceList = knownAlliances.length
      ? knownAlliances.map(a => `- "${a.name}"${a.formed_episode ? ` (formed ep ${a.formed_episode})` : ''}${a.is_active ? '' : ' [dissolved]'}: ${a.members.join(', ') || 'no members'}`).join('\n')
      : '(none recorded yet)';

    const system = `You extract fantasy-league scoring events from ${season.show_name} episode recaps. Be precise and conservative: only record what the sources clearly state. Use exact names from the roster and exact event_type values from the rules. If the sources disagree or something is unclear, leave it out and add a warning instead of guessing.

Season: ${season.show_name} ${season.season_number}${season.name ? ` (${season.name})` : ''}. Cast size: ${season.cast_count}. Active tribes: ${tribesRes.rows.map((t: any) => t.name).join(', ') || 'merged'}.

ROSTER
${roster}

SCORING RULES (event_type: meaning)
${ruleList}

HOW TO APPLY THE RULES
- tribe_wins_immunity / tribe_wins_reward: one event for EVERY member of the winning tribe(s) who played (list each player). If two tribes are safe in a three-tribe format, both tribes win immunity.
- wins_individual_immunity: the necklace winner(s). wins_individual_reward: the individual reward challenge winner. chosen_for_reward: players the winner brought along.
- receives_votes: count = number of votes cast against that player at tribal council (all players who received votes, not only the boot).
- in_on_vote: every player who voted for the person who was actually eliminated (the majority). Do not include the eliminated player.
- placement: do NOT emit as an event; report boots in "eliminated" instead (the app computes placement).
- finds_idol / finds_advantage: when found this episode. idol_advantage_play: when an idol or advantage is played. correct_idol_play: an idol that negated votes. idol_misplay: an idol played that negated nothing. vote_out_with_idol: each majority voter when the boot went home with an unplayed idol; voted_out_with_idol: the boot in that case.
- makes_merge: every player still in the game at the merge episode. makes_jury: each player when they become a juror (first juror episode onward, one event each). goes_on_journey: each player sent on a journey/summit.
- coin_flip_correct / coin_flip_wrong: the player who took the Open Era coin flip, by outcome (a wrong call also goes in "eliminated"). shot_in_the_dark_played: everyone who played a Shot in the Dark; shot_in_the_dark_hits: only if it landed. fails_journey_task: a journey/exile task or gamble the player lost (e.g. failed to earn the idol).
- votes_with_minority: every player at tribal who voted for someone other than the person eliminated (players who played a Shot in the Dark forfeit their vote and get neither in_on_vote nor votes_with_minority). survives_rocks / drawn_out_by_rocks: rock draws only. jury_vote_received: count = jury votes each finalist got at Final Tribal Council. provides_food: a player shown catching or gathering food for the tribe. quits_or_medevac: in addition to reporting them in "eliminated".
- Only use rules that exist in the list. Never invent players.

ALLIANCES (tracked separately from scoring — they are not events)
Known alliances so far:
${allianceList}
Report every alliance, voting bloc, pair or trio the sources describe as working together this episode, with its members. Reuse a known alliance's exact name and status "updated" if its membership changed or the sources add members; use "dissolved" if it broke up; use "new" for anything not in the list. Do not re-report a known alliance whose membership is unchanged. Prefer the name used on screen or in the recap; otherwise a short descriptive name.`;

    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (cleanUrls.length) {
      content.push({ type: 'text', text: `Episode ${episode} sources to read (fetch each one):\n${cleanUrls.map(u => `- ${u}`).join('\n')}` });
    }
    if (String(text).trim()) {
      content.push({ type: 'document', source: { type: 'text', media_type: 'text/plain', data: String(text).slice(0, 200000) }, title: `Pasted notes for episode ${episode}` });
    }
    content.push({ type: 'text', text: `Extract every scoring event for Episode ${episode} from the sources above. Cover challenges (tribe and individual), tribal council votes (who received how many votes, who voted with the majority), idols and advantages found or played, journeys, merge/jury milestones if this is that episode, and who was eliminated. Also list the alliances described in the sources. Return the structured result.` });

    const client = new Anthropic({ apiKey });
    const tools: Anthropic.Beta.BetaToolUnion[] = cleanUrls.length
      ? [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: cleanUrls.length + 2, max_content_tokens: 60000 }]
      : [];

    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{ role: 'user', content }],
      tools,
      output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown> }, effort: 'high' },
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === 'refusal') {
      res.status(422).json({ error: 'The model declined this request. Try pasting the article text instead of a link.' });
      return;
    }
    const textOut = message.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
    let parsed: Extracted;
    try {
      parsed = JSON.parse(textOut);
    } catch {
      res.status(502).json({ error: 'Could not parse the extraction result. Try again or paste the text.' });
      return;
    }

    const fetchErrors = message.content
      .filter((b: any) => b.type === 'web_fetch_tool_result' && b.content && !Array.isArray(b.content) && b.content.type === 'web_fetch_tool_result_error')
      .map((b: any) => `Could not fetch a source (${b.content.error_code}). Paste its text instead.`);

    const ruleSet = new Set(rules.map((r: any) => r.event_type));
    const proposals = parsed.events.map(e => {
      const player = resolvePlayer(e.player, players);
      const known = ruleSet.has(e.event_type);
      return {
        player_id: player?.id ?? null,
        player_name: player?.name ?? e.player,
        event_type: e.event_type,
        count: Math.max(1, Math.min(20, e.count || 1)),
        evidence: e.evidence,
        confidence: e.confidence,
        problem: !player ? `Unknown player "${e.player}"` : !known ? `Unknown rule "${e.event_type}"` : null,
      };
    });
    const eliminated = parsed.eliminated.map(el => {
      const player = resolvePlayer(el.player, players);
      return { ...el, player_id: player?.id ?? null, player_name: player?.name ?? el.player };
    });

    const alliances = (parsed.alliances || []).map(a => {
      const members = a.members.map(name => {
        const player = resolvePlayer(name, players);
        return { player_id: player?.id ?? null, player_name: player?.name ?? name };
      });
      const existing = knownAlliances.find(k => normalize(k.name) === normalize(a.name)) || null;
      const unknown = members.filter(m => !m.player_id).map(m => m.player_name);
      return {
        name: a.name,
        status: a.status,
        existing_id: existing?.id ?? null,
        members,
        evidence: a.evidence,
        confidence: a.confidence,
        problem: unknown.length ? `Unknown player${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}` : members.filter(m => m.player_id).length < 2 ? 'Fewer than two known members' : null,
      };
    });

    res.json({
      episode,
      proposals,
      eliminated,
      alliances,
      summary: parsed.summary,
      warnings: [...fetchErrors, ...(parsed.warnings || [])],
      usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens, model: message.model },
    });
  } catch (err: any) {
    if (err instanceof Anthropic.APIError) {
      console.error('Extraction API error:', err.status, err.message);
      res.status(502).json({ error: `Claude API error (${err.status}): ${err.message}` });
      return;
    }
    console.error('Extraction error:', err);
    res.status(500).json({ error: err.message || 'Extraction failed' });
  }
});

export default router;
