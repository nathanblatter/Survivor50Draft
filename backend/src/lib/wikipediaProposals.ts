import { WikiEpisodeFacts, WikiJury, WikiWinner } from './wikipedia';
import { resolvePlayer, normalizeName } from './players';

/** The shape the admin's extraction UI consumes (shared with the Claude proposals). */
export interface Proposal {
  player_id: number | null;
  player_name: string;
  event_type: string;
  count: number;
  evidence: string;
  confidence: 'high' | 'medium' | 'low';
  problem: string | null;
  source: 'wikipedia' | 'claude';
}

export interface Eliminated {
  player_id: number | null;
  player_name: string;
  votes_received: number;
  had_idol: boolean;
  how: string;
}

export interface RosterForWiki {
  id: number;
  name: string;
  nickname: string | null;
  tribe: string;
  /** Episode the player was voted out in, from their placement event; null while still in. */
  out_episode: number | null;
  /** Holds an unplayed idol right now. */
  has_idol: boolean;
}

/** Event types Wikipedia decides outright; the LLM is told to leave these alone. */
export const WIKI_EVENT_TYPES = [
  'receives_votes', 'in_on_vote', 'votes_with_minority', 'shot_in_the_dark_played', 'shot_in_the_dark_hits',
  'tribe_wins_immunity', 'tribe_wins_reward', 'wins_individual_immunity', 'wins_individual_reward', 'chosen_for_reward',
  'goes_on_journey', 'quits_or_medevac', 'Win_fire', 'Lose_fire', 'get_taken_to_f3', 'makes_ftc', 'jury_vote_received',
  'votes_for_winner', 'Win_The_Game', 'vote_out_with_idol', 'voted_out_with_idol', 'Voting_against_yourself',
];

interface Ctx {
  episode: number;
  players: RosterForWiki[];
  rules: Set<string>;
  proposals: Proposal[];
  warnings: string[];
}

export function proposalsFromWikipedia(facts: WikiEpisodeFacts, jury: WikiJury | null, players: RosterForWiki[], ruleTypes: Iterable<string>) {
  const ctx: Ctx = { episode: facts.episode, players, rules: new Set(ruleTypes), proposals: [], warnings: [] };
  const eliminated: Eliminated[] = [];
  const inGame = players.filter(p => p.out_episode === null || p.out_episode >= facts.episode);

  // Challenges
  for (const w of facts.reward) winner(ctx, w, inGame, 'tribe_wins_reward', 'wins_individual_reward', 'chosen_for_reward', 'reward');
  for (const w of facts.immunity) winner(ctx, w, inGame, 'tribe_wins_immunity', 'wins_individual_immunity', null, 'immunity');
  for (const name of facts.journeys) add(ctx, name, 'goes_on_journey', 1, 'Wikipedia: went on the journey / to Exile');

  // Tribal councils
  for (const t of facts.tribals) {
    if (t.how === 'tie') { ctx.warnings.push(`Tribal ${t.label}: tied first vote (${t.tally}); only the revote is scored. Add anything the first vote should score by hand.`); continue; }
    const boot = t.boot ? resolvePlayer(t.boot, players) : null;
    if (t.boot && !boot) ctx.warnings.push(`Wikipedia names "${t.boot}" as eliminated but no roster player matches.`);
    const received = new Map<string, number>();
    for (const v of t.votes) received.set(v.target, (received.get(v.target) ?? 0) + v.count);
    for (const [target, count] of received) add(ctx, target, 'receives_votes', count, `Wikipedia voting history: ${count} vote${count === 1 ? '' : 's'} (${t.tally})`);
    if (boot) {
      const bootKey = normalizeName(boot.name).split(' ')[0];
      const votedBoot = (v: { target: string }) => { const r = resolvePlayer(v.target, players); return r ? r.id === boot.id : normalizeName(v.target).split(' ')[0] === bootKey; };
      for (const v of t.votes) {
        const voter = resolvePlayer(v.voter, players);
        if (voter && voter.id === boot.id && votedBoot(v)) { add(ctx, v.voter, 'Voting_against_yourself', 1, 'Wikipedia voting history: voted for themselves'); continue; }
        if (votedBoot(v)) {
          add(ctx, v.voter, 'in_on_vote', 1, `Wikipedia voting history: voted ${boot.name.split(' ')[0]} (${t.tally})`);
          if (boot.has_idol) add(ctx, v.voter, 'vote_out_with_idol', 1, `${boot.name.split(' ')[0]} went home holding an idol (game state)`);
        } else {
          add(ctx, v.voter, 'votes_with_minority', 1, `Wikipedia voting history: voted ${v.target}; ${boot.name.split(' ')[0]} went home`);
        }
      }
      if (boot.has_idol) add(ctx, boot.name, 'voted_out_with_idol', 1, 'Went home holding an unplayed idol (game state)');
      if (t.how === 'medevac' || t.how === 'quit') add(ctx, boot.name, 'quits_or_medevac', 1, `Wikipedia: ${t.how}`);
      eliminated.push({ player_id: boot.id, player_name: boot.name, votes_received: received.get(t.boot!) ?? [...received.entries()].find(([k]) => resolvePlayer(k, players)?.id === boot.id)?.[1] ?? 0, had_idol: boot.has_idol, how: t.how });
    } else if (t.how !== 'none' && t.votes.length) {
      ctx.warnings.push(`Tribal ${t.label}: votes found but no boot resolved; in_on_vote / votes_with_minority were not proposed.`);
    }
    for (const name of t.shotInTheDark) {
      add(ctx, name, 'shot_in_the_dark_played', 1, 'Wikipedia voting history: played Shot in the Dark');
      const p = resolvePlayer(name, players);
      if (p && boot && p.id !== boot.id && t.votes.some(v => resolvePlayer(v.target, players)?.id === p.id)) {
        ctx.warnings.push(`${p.name} played a Shot in the Dark and received votes but was not voted out — check whether it landed (shot_in_the_dark_hits).`);
      }
    }
    for (const f of t.fire) {
      if (f.outcome === 'won') add(ctx, f.player, 'Win_fire', 1, 'Wikipedia: won the fire-making challenge');
      if (f.outcome === 'lost') add(ctx, f.player, 'Lose_fire', 1, 'Wikipedia: lost the fire-making challenge');
      if (f.outcome === 'saved') add(ctx, f.player, 'get_taken_to_f3', 1, 'Wikipedia: taken to the final three by the immunity winner');
    }
    if (t.votes.some(v => v.negated)) ctx.warnings.push(`Tribal ${t.label}: some votes were negated (an idol was played) — add idol_advantage_play / correct_idol_play and check in_on_vote.`);
    for (const n of t.notes) ctx.warnings.push(`Tribal ${t.label}: ${n}`);
  }

  // Finale
  if (jury && jury.episode === facts.episode && jury.finalists.length) {
    const tally = new Map<string, number>();
    for (const v of jury.votes) tally.set(v.finalist, (tally.get(v.finalist) ?? 0) + 1);
    const winnerName = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    for (const f of jury.finalists) {
      add(ctx, f, 'makes_ftc', 1, 'Wikipedia: finalist');
      const n = tally.get(f) ?? 0;
      if (n) add(ctx, f, 'jury_vote_received', n, `Wikipedia jury vote: ${n} vote${n === 1 ? '' : 's'} (${jury.tally})`);
    }
    if (winnerName) {
      add(ctx, winnerName, 'Win_The_Game', 1, `Wikipedia: won ${jury.tally}`);
      for (const v of jury.votes) if (v.finalist === winnerName) add(ctx, v.juror, 'votes_for_winner', 1, `Wikipedia jury vote: voted for ${winnerName}`);
    }
  }

  for (const n of facts.notes) ctx.warnings.push(`Wikipedia note: ${n}`);
  return { proposals: ctx.proposals, eliminated, warnings: ctx.warnings };
}

function winner(ctx: Ctx, w: WikiWinner, inGame: RosterForWiki[], tribeType: string, indivType: string, guestType: string | null, label: string) {
  if (w.tribe) {
    const members = inGame.filter(p => normalizeName(p.tribe) === normalizeName(w.tribe!));
    if (!members.length) { ctx.warnings.push(`Wikipedia says tribe "${w.tribe}" won ${label} but no roster player is on a tribe by that name.`); return; }
    for (const m of members) push(ctx, m, tribeType, 1, `Wikipedia: ${m.tribe} won ${label}`);
    return;
  }
  for (const name of w.players) {
    const p = resolvePlayer(name, ctx.players);
    if (!p) { ctx.warnings.push(`Wikipedia ${label} winner "${name}" is not a roster player (a team or event name?) — nothing proposed for it.`); continue; }
    push(ctx, p, indivType, 1, `Wikipedia: won ${label}`);
  }
  if (guestType) for (const g of w.guests) add(ctx, g, guestType, 1, `Wikipedia: brought on the ${label}`);
}

function add(ctx: Ctx, name: string, type: string, count: number, evidence: string) {
  const p = resolvePlayer(name, ctx.players);
  if (!p) { ctx.proposals.push({ player_id: null, player_name: name, event_type: type, count, evidence, confidence: 'high', problem: `Unknown player "${name}"`, source: 'wikipedia' }); return; }
  push(ctx, p, type, count, evidence);
}

function push(ctx: Ctx, p: RosterForWiki, type: string, count: number, evidence: string) {
  if (!ctx.rules.has(type)) return; // the show doesn't score this
  const existing = ctx.proposals.find(x => x.player_id === p.id && x.event_type === type);
  if (existing) { existing.count += count; return; }
  ctx.proposals.push({ player_id: p.id, player_name: p.name, event_type: type, count, evidence, confidence: 'high', problem: null, source: 'wikipedia' });
}
