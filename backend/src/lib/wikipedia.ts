/**
 * Wikipedia season pages ("Survivor 51") carry two deterministic tables we can score from without an LLM:
 *   - the season summary (reward / immunity winners, journeys, boot per episode)
 *   - the voting history (every vote at every tribal council, Shot in the Dark, exile, medevacs)
 * This module fetches the raw wikitext and turns the episode's rows into plain facts. It is conservative:
 * anything it does not understand becomes a warning for the commissioner instead of a guess.
 */

const USER_AGENT = 'survivor-fantasy-draft/1.0 (https://survivor.nathanblatter.com)';

export interface WikiVote {
  voter: string;
  target: string;
  /** Extra-vote / vote-steal advantages let one voter cast two ballots. */
  count: number;
  /** The vote was negated (struck through on Wikipedia — an idol or similar). */
  negated: boolean;
}

export interface WikiTribal {
  /** Column label on the voting table, e.g. "11b" when an episode has several tribal councils. */
  label: string;
  boot: string | null;
  tally: string;
  /** How the boot left when it wasn't a normal vote: "medevac", "quit", "tie" (revote column), ... */
  how: string;
  votes: WikiVote[];
  shotInTheDark: string[];
  /** Players present but who cast no vote (vote stolen, lost a vote, immune at final four...). */
  noVote: { player: string; reason: string }[];
  /** Final-four fire-making outcomes when present: won / lost / saved / immune. */
  fire: { player: string; outcome: string }[];
  notes: string[];
}

export interface WikiWinner {
  /** A tribe (by its Wikipedia slug, e.g. "savu") or null for an individual win. */
  tribe: string | null;
  /** Individual winner(s) — several when a team / pair won. */
  players: string[];
  /** Players the winner brought along, written as [A, B] on Wikipedia. */
  guests: string[];
}

export interface WikiEpisodeFacts {
  episode: number;
  title: string | null;
  airDate: string | null;
  reward: WikiWinner[];
  immunity: WikiWinner[];
  journeys: string[];
  /** Boots listed in the season summary (name only). */
  eliminated: string[];
  tribals: WikiTribal[];
  notes: string[];
}

export interface WikiJury {
  episode: number | null;
  finalists: string[];
  tally: string;
  votes: { juror: string; finalist: string }[];
}

export interface WikiSeason {
  episodes: WikiEpisodeFacts[];
  jury: WikiJury | null;
  warnings: string[];
}

// ── Fetch ──

export function wikipediaTitleFor(showName: string, seasonNumber: number) {
  return `${showName} ${seasonNumber}`;
}

export async function fetchWikitext(title: string, timeoutMs = 15000): Promise<string> {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&redirects=1&prop=wikitext&format=json&formatversion=2&page=${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Wikipedia returned HTTP ${res.status}`);
  const data: any = await res.json();
  if (data.error) throw new Error(`Wikipedia: ${data.error.info || data.error.code}`);
  const text = data?.parse?.wikitext;
  if (typeof text !== 'string') throw new Error('Wikipedia returned no wikitext');
  return text;
}

// ── Wikitext primitives ──

interface Template { name: string; args: string[]; start: number; end: number; }

/** Find the top-level templates in a string, honouring nested {{ }}. */
function templatesIn(text: string): Template[] {
  const out: Template[] = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('{{', i)) {
      let depth = 0;
      let j = i;
      while (j < text.length) {
        if (text.startsWith('{{', j)) { depth++; j += 2; continue; }
        if (text.startsWith('}}', j)) { depth--; j += 2; if (depth === 0) break; continue; }
        j++;
      }
      const inner = text.slice(i + 2, j - 2);
      const parts = splitTopLevel(inner, '|');
      out.push({ name: parts[0].trim().toLowerCase(), args: parts.slice(1), start: i, end: j });
      i = j;
    } else i++;
  }
  return out;
}

/** Split on a separator that is not inside {{ }} or [[ ]] or <s>…</s>-style tags. */
function splitTopLevel(text: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let link = 0;
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('{{', i)) { depth++; cur += '{{'; i++; continue; }
    if (text.startsWith('}}', i)) { depth--; cur += '}}'; i++; continue; }
    if (text.startsWith('[[', i)) { link++; cur += '[['; i++; continue; }
    if (text.startsWith(']]', i)) { link--; cur += ']]'; i++; continue; }
    if (depth === 0 && link === 0 && text.startsWith(sep, i)) { parts.push(cur); cur = ''; i += sep.length - 1; continue; }
    cur += text[i];
  }
  parts.push(cur);
  return parts;
}

/** Footnote texts ({{efn|...}}) attached to a cell, for notes/warnings. */
function footnotes(text: string): string[] {
  return templatesIn(text)
    .filter(t => t.name === 'efn' || t.name === 'refn')
    .map(t => t.args.filter(a => !/^\s*name\s*=/.test(a)).map(a => a.replace(/^\s*[\w-]+\s*=/, '')).join(' ').trim())
    .map(plainText)
    .filter(Boolean);
}

/** Named footnote references ({{efn|name=Shot}}) — the name carries meaning even when the text is defined elsewhere. */
function footnoteNames(text: string): string[] {
  return templatesIn(text)
    .filter(t => t.name === 'efn')
    .flatMap(t => t.args.map(a => /^\s*name\s*=\s*"?([^"]*)"?\s*$/.exec(a)?.[1]?.toLowerCase() ?? '').filter(Boolean));
}

/** Reduce a cell to readable text: templates resolved, footnotes dropped, markup stripped. */
function plainText(text: string): string {
  let s = text;
  // Resolve templates innermost-first by repeatedly replacing top-level ones.
  for (let guard = 0; guard < 10 && s.includes('{{'); guard++) {
    const ts = templatesIn(s);
    if (!ts.length) break;
    let rebuilt = '';
    let pos = 0;
    for (const t of ts) {
      rebuilt += s.slice(pos, t.start);
      if (t.name === 'stribe') rebuilt += t.args[1] ?? '';
      else if (t.name === 'nowrap' || t.name === 'nobr') rebuilt += t.args[0] ?? '';
      else if (t.name === 'ya' || t.name === 'yes' || t.name === 'check') rebuilt += '✓';
      else if (t.name === 'efn' || t.name === 'refn' || t.name === 'notelist') rebuilt += '';
      else rebuilt += t.args.find(a => !a.includes('=')) ?? '';
      pos = t.end;
    }
    s = rebuilt + s.slice(pos);
  }
  return s
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?s>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/'{2,}/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// ── Tables ──

interface Cell { raw: string; text: string; header: boolean; rowspan: number; colspan: number; attrs: string; }

const ATTR_RE = /^\s*((?:[\w-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s|]+)\s*)+)/;

function parseCell(src: string, header: boolean): Cell {
  let attrs = '';
  let body = src;
  const parts = splitTopLevel(src, '|');
  if (parts.length > 1 && /=/.test(parts[0]) && !/\{\{|\[\[/.test(parts[0])) {
    attrs = parts[0];
    body = parts.slice(1).join('|');
  } else {
    const m = ATTR_RE.exec(src);
    if (m && /rowspan|colspan|style|align|scope|class|width|bgcolor/i.test(m[1])) { attrs = m[1]; body = src.slice(m[0].length); }
  }
  const span = (name: string) => parseInt(new RegExp(`${name}\\s*=\\s*"?(\\d+)`, 'i').exec(attrs)?.[1] ?? '1') || 1;
  return { raw: body.trim(), text: plainText(body), header, rowspan: span('rowspan'), colspan: span('colspan'), attrs };
}

/** Parse every {| ... |} table in a chunk of wikitext into a rowspan/colspan-expanded grid. */
export function parseTables(wikitext: string): Cell[][][] {
  const tables: Cell[][][] = [];
  const re = /\{\|[\s\S]*?\n\|\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext))) {
    const lines = m[0].split('\n').slice(1, -1);
    const rows: Cell[][] = [];
    let row: Cell[] = [];
    let cellBuf: { src: string; header: boolean } | null = null;
    const flush = () => { if (cellBuf) { for (const piece of splitTopLevel(cellBuf.src, cellBuf.header ? '!!' : '||')) row.push(parseCell(piece, cellBuf.header)); cellBuf = null; } };
    for (const line of lines) {
      if (line.startsWith('|-')) { flush(); if (row.length) rows.push(row); row = []; continue; }
      if (line.startsWith('|+')) { flush(); continue; }
      if (line.startsWith('!')) { flush(); cellBuf = { src: line.slice(1), header: true }; continue; }
      if (line.startsWith('|')) { flush(); cellBuf = { src: line.slice(1), header: false }; continue; }
      if (cellBuf) cellBuf.src += '\n' + line; // multi-line cell
    }
    flush();
    if (row.length) rows.push(row);
    tables.push(expandSpans(rows));
  }
  return tables;
}

function expandSpans(rows: Cell[][]): Cell[][] {
  const grid: Cell[][] = [];
  rows.forEach((cells, r) => {
    grid[r] ??= [];
    let c = 0;
    for (const cell of cells) {
      while (grid[r][c]) c++;
      for (let dr = 0; dr < cell.rowspan; dr++) {
        grid[r + dr] ??= [];
        for (let dc = 0; dc < cell.colspan; dc++) grid[r + dr][c + dc] = cell;
      }
      c += cell.colspan;
    }
  });
  return grid.filter(r => r && r.length);
}

function section(wikitext: string, heading: string): string {
  const re = new RegExp(`^==\\s*${heading}\\s*==\\s*$`, 'im');
  const m = re.exec(wikitext);
  if (!m) return '';
  const rest = wikitext.slice(m.index + m[0].length);
  const next = /^==[^=].*==\s*$/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

// ── Season summary ──

/** "Ozzy<br />(Cila)" → ["Ozzy"], "Stephenie [Chrissy, Jonathan]" → winners+guests, "Joe & Tiffany" → both. */
function parseWinnerCell(cell: Cell): WikiWinner[] {
  const out: WikiWinner[] = [];
  const stribes = templatesIn(cell.raw).filter(t => t.name === 'stribe');
  const tribeOnly = stribes.filter(t => !(t.args[1] ?? '').trim());
  for (const t of tribeOnly) {
    const slug = (t.args[0] ?? '').trim().toLowerCase();
    if (slug && slug !== 'none') out.push({ tribe: slug, players: [], guests: [] });
  }
  const text = cell.text.replace(/\([^)]*\)/g, ' ');
  if (!text || /^none$/i.test(text.trim())) return out;
  if (tribeOnly.length && stribes.length === tribeOnly.length) return out;
  const guests: string[] = [];
  const body = text.replace(/\[([^\]]*)\]/g, (_, g) => { guests.push(...splitNames(g)); return ' '; });
  const players = splitNames(body);
  if (players.length) out.push({ tribe: null, players, guests });
  return out;
}

function splitNames(s: string): string[] {
  return s.split(/\n|,|&|\band\b|;/).map(x => x.replace(/\s+/g, ' ').trim()).filter(x => x && !/^none$/i.test(x) && !/^(tie|n\/a)$/i.test(x));
}

function parseSeasonSummary(wikitext: string, warnings: string[]): WikiEpisodeFacts[] {
  const tables = parseTables(section(wikitext, 'Season summary'));
  const table = tables.find(t => t.some(r => r.some(c => /^reward$/i.test(c.text)) && r.some(c => /^immunity$/i.test(c.text))));
  if (!table) { warnings.push('Wikipedia: no season summary table found.'); return []; }
  const headerIdx = table.findIndex(r => r.some(c => /^reward$/i.test(c.text)));
  const header = table[headerIdx].map(c => c.text.toLowerCase());
  const col = (re: RegExp) => header.findIndex(h => re.test(h));
  const cNo = col(/^no\.?$/), cTitle = col(/^title$/), cDate = col(/air ?date/), cReward = col(/^reward$/), cImm = col(/^immunity$/),
    cJourney = col(/journey|exile/), cPlayer = header.length - 1;
  const byEp = new Map<number, WikiEpisodeFacts>();
  const seen = new Set<Cell>();
  for (const row of table.slice(headerIdx + 1)) {
    const noCell = row[cNo];
    const ep = parseInt(noCell?.text ?? '');
    if (!Number.isInteger(ep)) continue;
    let f = byEp.get(ep);
    if (!f) {
      f = { episode: ep, title: null, airDate: null, reward: [], immunity: [], journeys: [], eliminated: [], tribals: [], notes: [] };
      byEp.set(ep, f);
    }
    if (cTitle >= 0 && row[cTitle]) f.title = row[cTitle].text.replace(/^"|"$/g, '') || f.title;
    if (cDate >= 0 && row[cDate]) f.airDate = row[cDate].text || f.airDate;
    const take = (c: number, into: WikiWinner[]) => {
      const cell = row[c];
      if (!cell || seen.has(cell)) return;
      seen.add(cell);
      into.push(...parseWinnerCell(cell));
      for (const n of footnotes(cell.raw)) f!.notes.push(n);
    };
    if (cReward >= 0) take(cReward, f.reward);
    if (cImm >= 0) take(cImm, f.immunity);
    if (cJourney >= 0 && row[cJourney] && !seen.has(row[cJourney])) {
      seen.add(row[cJourney]);
      for (const w of parseWinnerCell(row[cJourney])) f.journeys.push(...w.players, ...w.guests);
      for (const n of footnotes(row[cJourney].raw)) f.notes.push(n);
    }
    const pc = row[cPlayer];
    if (pc && !seen.has(pc)) {
      seen.add(pc);
      f.eliminated.push(...splitNames(pc.text));
      for (const n of footnotes(pc.raw)) f.notes.push(n);
    }
  }
  return [...byEp.values()].sort((a, b) => a.episode - b.episode);
}

// ── Voting history ──

function parseVotingHistory(wikitext: string, episodes: Map<number, WikiEpisodeFacts>, warnings: string[]): WikiJury | null {
  const tables = parseTables(section(wikitext, 'Voting history'));
  let jury: WikiJury | null = null;
  for (const table of tables) {
    const label = (r: Cell[]) => (r[0]?.text ?? '').toLowerCase().trim();
    const rowOf = (re: RegExp) => table.find(r => re.test(label(r)));
    if (table.some(r => /jury vote/i.test(r[0]?.text ?? '')) || rowOf(/^juror$/)) {
      jury = parseJury(table);
      continue;
    }
    const epRow = rowOf(/^episode$/);
    const elimRow = rowOf(/^eliminated$/);
    const votesRow = rowOf(/^votes$/);
    const voterHeader = table.findIndex(r => /^voter$/.test(label(r)));
    if (!epRow || !elimRow || voterHeader < 0) continue;
    const width = Math.max(epRow.length, elimRow.length);
    // Group columns by episode; several columns = several tribal councils (or a tie + revote).
    const columns: { col: number; episode: number }[] = [];
    for (let c = 1; c < width; c++) {
      const ep = parseInt((epRow[c]?.text ?? '').replace(/\D+/g, ' ').trim().split(' ')[0] ?? '');
      if (Number.isInteger(ep)) columns.push({ col: c, episode: ep });
    }
    // Adjacent columns that share one "Eliminated" cell are one tribal council (a vote + revote).
    const groups: { episode: number; cols: number[]; elim: Cell }[] = [];
    for (const { col, episode } of columns) {
      const elim = elimRow[col];
      if (!elim || !elim.text.trim()) continue; // not played yet
      const last = groups[groups.length - 1];
      if (last && last.elim === elim && last.episode === episode) last.cols.push(col);
      else groups.push({ episode, cols: [col], elim });
    }
    for (const group of groups) {
      const { episode, elim } = group;
      const col = group.cols[group.cols.length - 1]; // the revote column, when there was one
      const siblings = groups.filter(g => g.episode === episode);
      const n = siblings.indexOf(group) + 1;
      const bootText = elim.text;
      const tallyCell = votesRow?.[col];
      const tally = tallyCell?.text ?? '';
      const tribal: WikiTribal = {
        label: `${episode}${siblings.length > 1 ? String.fromCharCode(96 + n) : ''}`,
        boot: null, tally, how: 'voted out', votes: [], shotInTheDark: [], noVote: [], fire: [], notes: [],
      };
      const bootNotes = [...footnotes(elim.raw), ...(tallyCell ? footnotes(tallyCell.raw) : [])];
      tribal.notes.push(...bootNotes);
      const boots = splitNames(bootText);
      if (/^tie$/i.test(bootText.trim())) { tribal.how = 'tie'; tribal.notes.push('This column is a tied vote; the revote is scored from the next column.'); }
      else if (/^none$/i.test(bootText.trim())) { tribal.how = 'none'; }
      else {
        tribal.boot = boots[0] ?? null;
        if (boots.length > 1) tribal.notes.push(`Several players left at this tribal council: ${boots.join(', ')}`);
      }
      if (group.cols.length > 1) tribal.notes.push('A revote happened; the votes shown are from the revote.');
      if (/evacuat/i.test(tally + ' ' + bootNotes.join(' '))) tribal.how = 'medevac';
      else if (/\bquit/i.test(tally + ' ' + bootNotes.join(' '))) tribal.how = 'quit';
      else if (/rock/i.test(tally + ' ' + bootNotes.join(' '))) tribal.notes.push('Rocks were drawn — record survives_rocks / drawn_out_by_rocks by hand.');

      for (const row of table.slice(voterHeader + 1)) {
        const voter = row[0]?.text?.trim();
        const cell = row[col];
        if (!voter || !cell) continue;
        if (/darkgray|gray|grey/i.test(cell.attrs) && !cell.text.trim()) continue; // out of the game
        const raw = cell.raw;
        const names = footnoteNames(raw);
        const notes = footnotes(raw).join(' ');
        const text = cell.text.trim();
        if (!text) {
          if (names.includes('shot') || /shot in the dark/i.test(notes)) { tribal.shotInTheDark.push(voter); continue; }
          if (/lost a vote|vote steal|stole|could not vote|no vote/i.test(notes) || names.some(n => /lost|loss|votestole|steal/.test(n))) { tribal.noVote.push({ player: voter, reason: notes || 'no vote' }); continue; }
          if (names.length || notes) tribal.noVote.push({ player: voter, reason: notes || names.join(', ') });
          continue; // not at this tribal
        }
        if (/^(exiled|exile)$/i.test(text)) { tribal.noVote.push({ player: voter, reason: 'exiled' }); continue; }
        const fire = /^(won|lost|saved|immune)$/i.exec(text);
        if (fire) { tribal.fire.push({ player: voter, outcome: fire[1].toLowerCase() }); continue; }
        if (/^(safe|immune|evacuated|quit|none|n\/a)$/i.test(text)) { tribal.noVote.push({ player: voter, reason: text.toLowerCase() }); continue; }
        const negated = /<s>/i.test(raw);
        const count = /extra vote|two ballots|vote steal|cast two/i.test(notes) || names.some(n => /extra|steal/.test(n)) ? 2 : 1;
        const targets = splitNames(text);
        // Several names in one cell: a double boot (everyone voted for both) or a same-column revote (last vote counts).
        const doubleBoot = boots.length > 1 && targets.every(t => boots.includes(t));
        const counted = doubleBoot ? targets : targets.slice(-1);
        if (targets.length > 1 && !doubleBoot) tribal.notes.push(`${voter} has several votes listed (${targets.join(' / ')}); the last one is used.`);
        for (const target of counted) tribal.votes.push({ voter, target, count, negated });
        if (/idol/i.test(notes)) tribal.notes.push(`${voter}: ${notes}`);
      }
      if (tribal.fire.length) { tribal.how = 'fire-making'; tribal.boot = tribal.boot ?? tribal.fire.find(f => f.outcome === 'lost')?.player ?? null; }
      if (/idol/i.test(bootNotes.join(' '))) tribal.notes.push('An idol was played at this tribal council — add idol_advantage_play / correct_idol_play / idol_misplay by hand.');
      let facts = episodes.get(episode);
      if (!facts) {
        facts = { episode, title: null, airDate: null, reward: [], immunity: [], journeys: [], eliminated: [], tribals: [], notes: [] };
        episodes.set(episode, facts);
      }
      facts.tribals.push(tribal);
    }
  }
  if (!episodes.size) warnings.push('Wikipedia: no voting history table found.');
  return jury;
}

function parseJury(table: Cell[][]): WikiJury | null {
  const label = (r: Cell[]) => (r[0]?.text ?? '').toLowerCase().trim();
  const finalistRow = table.find(r => /^finalists?$/.test(label(r)));
  const jurorHeader = table.findIndex(r => /^juror$/.test(label(r)));
  if (!finalistRow || jurorHeader < 0) return null;
  const finalists = finalistRow.slice(1).map(c => c.text.trim()).filter(Boolean);
  const epRow = table.find(r => /^episode$/.test(label(r)));
  const episode = parseInt((epRow?.[1]?.text ?? '').replace(/\D+/g, ' ').trim()) || null;
  const tally = table.find(r => /^votes$/.test(label(r)))?.[1]?.text ?? '';
  const votes: { juror: string; finalist: string }[] = [];
  for (const row of table.slice(jurorHeader + 1)) {
    const juror = row[0]?.text?.trim();
    if (!juror) continue;
    finalists.forEach((f, i) => { if ((row[i + 1]?.text ?? '').includes('✓')) votes.push({ juror, finalist: f }); });
  }
  return { episode, finalists, tally, votes };
}

// ── Public ──

export function parseSeason(wikitext: string): WikiSeason {
  const warnings: string[] = [];
  const episodes = new Map<number, WikiEpisodeFacts>();
  for (const f of parseSeasonSummary(wikitext, warnings)) episodes.set(f.episode, f);
  const jury = parseVotingHistory(wikitext, episodes, warnings);
  return { episodes: [...episodes.values()].sort((a, b) => a.episode - b.episode), jury, warnings };
}

export function episodeFacts(season: WikiSeason, episode: number): WikiEpisodeFacts | null {
  return season.episodes.find(e => e.episode === episode) ?? null;
}

/** A readable digest of the facts, for the admin and for grounding the LLM extraction. */
export function describeFacts(f: WikiEpisodeFacts, jury: WikiJury | null): string {
  const lines: string[] = [];
  lines.push(`Episode ${f.episode}${f.title ? ` "${f.title}"` : ''}${f.airDate ? ` (${f.airDate})` : ''}`);
  const win = (w: WikiWinner) => w.tribe ? `tribe ${w.tribe}` : `${w.players.join(', ')}${w.guests.length ? ` with ${w.guests.join(', ')}` : ''}`;
  if (f.reward.length) lines.push(`Reward: ${f.reward.map(win).join('; ')}`);
  if (f.immunity.length) lines.push(`Immunity: ${f.immunity.map(win).join('; ')}`);
  if (f.journeys.length) lines.push(`Journey / exile: ${f.journeys.join(', ')}`);
  for (const t of f.tribals) {
    lines.push(`Tribal council ${t.label}: ${t.boot ? `${t.boot} out` : t.how} ${t.tally ? `(${t.tally})` : ''}`.trim());
    const byTarget = new Map<string, string[]>();
    for (const v of t.votes) byTarget.set(v.target, [...(byTarget.get(v.target) ?? []), `${v.voter}${v.count > 1 ? ' ×2' : ''}${v.negated ? ' (negated)' : ''}`]);
    for (const [target, voters] of byTarget) lines.push(`  votes for ${target}: ${voters.join(', ')}`);
    if (t.shotInTheDark.length) lines.push(`  Shot in the Dark: ${t.shotInTheDark.join(', ')}`);
    if (t.noVote.length) lines.push(`  no vote: ${t.noVote.map(n => `${n.player} (${n.reason})`).join('; ')}`);
    if (t.fire.length) lines.push(`  fire-making: ${t.fire.map(x => `${x.player} ${x.outcome}`).join(', ')}`);
    for (const n of t.notes) lines.push(`  note: ${n}`);
  }
  if (jury && jury.episode === f.episode) {
    lines.push(`Jury vote (${jury.tally}): ${jury.finalists.join(' / ')}`);
    for (const v of jury.votes) lines.push(`  ${v.juror} → ${v.finalist}`);
  }
  for (const n of f.notes) lines.push(`note: ${n}`);
  return lines.join('\n');
}
