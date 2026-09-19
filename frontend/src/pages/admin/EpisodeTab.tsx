import { useMemo, useState } from 'react';
import { api, eventLabel, formatPoints } from '../../api';
import { Player, Extraction, EventInput } from '../../types';
import { useAdmin } from './AdminContext';
import { useTribes } from '../../context/TribeContext';
import PlayerCard from '../../components/PlayerCard';

/** One row in the queue: a player + event, possibly repeated (votes). */
interface Pending {
  key: string;
  player_id: number;
  event_type: string;
  count: number;
  notes?: string;
  placement?: number;
}

const HANDLED = new Set(['placement', 'makes_merge', 'makes_jury', 'finds_idol', 'finds_advantage', 'tribe_wins_immunity', 'tribe_wins_reward', 'wins_individual_immunity', 'wins_individual_reward', 'chosen_for_reward', 'goes_on_journey', 'receives_votes', 'in_on_vote', 'vote_out_with_idol', 'voted_out_with_idol', 'correct_idol_play', 'idol_misplay', 'idol_advantage_play', 'voted_out_with_advantage']);

/**
 * Log Episode: a top-to-bottom flow. Every tap queues events immediately; the sticky bar at the
 * bottom shows what's queued and submits the whole episode in one transaction.
 */
export default function EpisodeTab() {
  const { season, players, activePlayers, rules, episode, setEpisode, refresh, flash } = useAdmin();
  const { activeTribes, getTribeColor } = useTribes();
  const [pending, setPending] = useState<Pending[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [showRare, setShowRare] = useState(false);

  // Tribal council scratch state
  const [bootId, setBootId] = useState(0);
  const [bootHadIdol, setBootHadIdol] = useState(false);
  const [votes, setVotes] = useState<Record<number, number>>({});
  const [voters, setVoters] = useState<number[]>([]);
  const [rewardWinner, setRewardWinner] = useState(0);
  // Extraction
  const [urls, setUrls] = useState('');
  const [pasted, setPasted] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [fixes, setFixes] = useState<Record<number, number>>({});

  const ruleOf = (t: string) => rules.find(r => r.event_type === t);
  const has = (t: string) => Boolean(ruleOf(t));
  const pts = (t: string, fallback = 0) => formatPoints(ruleOf(t)?.points ?? fallback);
  const playerById = (id: number) => players.find(p => p.id === id);
  const castCount = season?.cast_count || players.length;
  const oneTribe = activeTribes.length <= 1;

  // ── queue helpers ──
  const countOf = (pid: number, type: string) => pending.find(p => p.player_id === pid && p.event_type === type)?.count || 0;
  const setEvent = (pid: number, type: string, count: number, extra?: Partial<Pending>) => {
    setPending(prev => {
      const rest = prev.filter(p => !(p.player_id === pid && p.event_type === type));
      if (count <= 0) return rest;
      return [...rest, { key: `${pid}:${type}`, player_id: pid, event_type: type, count, ...extra }];
    });
  };
  const toggleEvent = (pid: number, type: string) => setEvent(pid, type, countOf(pid, type) ? 0 : 1);
  const tribeMembers = (name: string) => activePlayers.filter(p => p.tribe === name);
  const tribeFullySelected = (name: string, type: string) => tribeMembers(name).length > 0 && tribeMembers(name).every(p => countOf(p.id, type) > 0);
  const toggleTribe = (name: string, type: string) => {
    const all = tribeFullySelected(name, type);
    tribeMembers(name).forEach(p => setEvent(p.id, type, all ? 0 : 1));
  };

  // ── tribal council (live) ──
  const atTribal = bootId ? activePlayers.filter(p => oneTribe || p.tribe === playerById(bootId)?.tribe) : [];
  const chooseBoot = (id: number) => {
    const next = bootId === id ? 0 : id;
    if (bootId) { setEvent(bootId, 'placement', 0); setEvent(bootId, 'voted_out_with_idol', 0); }
    setBootId(next);
    setVoters([]);
    setVotes({});
    activePlayers.forEach(p => { setEvent(p.id, 'in_on_vote', 0); setEvent(p.id, 'receives_votes', 0); setEvent(p.id, 'vote_out_with_idol', 0); });
    if (next) {
      const placement = activePlayers.length;
      setEvent(next, 'placement', 1, { placement, notes: `Voted out in episode ${episode}` });
      if (bootHadIdol && has('voted_out_with_idol')) setEvent(next, 'voted_out_with_idol', 1);
    }
  };
  const setVote = (pid: number, n: number) => {
    const v = Math.max(0, n);
    setVotes(prev => ({ ...prev, [pid]: v }));
    setEvent(pid, 'receives_votes', v);
  };
  const setVoterList = (ids: number[]) => {
    setVoters(ids);
    activePlayers.forEach(p => {
      const on = ids.includes(p.id) && p.id !== bootId;
      setEvent(p.id, 'in_on_vote', on ? 1 : 0);
      if (has('vote_out_with_idol')) setEvent(p.id, 'vote_out_with_idol', on && bootHadIdol ? 1 : 0);
    });
  };
  const toggleBootIdol = (on: boolean) => {
    setBootHadIdol(on);
    if (bootId && has('voted_out_with_idol')) setEvent(bootId, 'voted_out_with_idol', on ? 1 : 0);
    if (has('vote_out_with_idol')) voters.forEach(v => setEvent(v, 'vote_out_with_idol', on ? 1 : 0));
  };

  // ── extraction ──
  const runExtraction = async () => {
    if (!season) return;
    const urlList = urls.split(/\s+/).map(s => s.trim()).filter(Boolean);
    if (urlList.length === 0 && !pasted.trim()) { flash('Add at least one article link or paste text', 'error'); return; }
    setExtracting(true); setExtraction(null);
    try {
      const result = await api.extractScoring(season.id, { episode, urls: urlList, text: pasted });
      setExtraction(result);
      setAccepted(new Set(result.proposals.map((p, i) => (p.problem || p.confidence === 'low') ? -1 : i).filter(i => i >= 0)));
      setFixes({});
      flash(`Claude proposed ${result.proposals.length} events. Tick the ones you agree with.`);
    } catch (err: any) { flash(err.message, 'error'); } finally { setExtracting(false); }
  };

  const acceptExtraction = () => {
    if (!extraction) return;
    let added = 0;
    extraction.proposals.forEach((p, i) => {
      if (!accepted.has(i)) return;
      const pid = fixes[i] ?? p.player_id;
      if (!pid || !has(p.event_type) || p.event_type === 'placement') return;
      if (p.event_type === 'receives_votes') setVotes(v => ({ ...v, [pid]: p.count }));
      if (p.event_type === 'in_on_vote') setVoters(v => v.includes(pid) ? v : [...v, pid]);
      setEvent(pid, p.event_type, p.count, { notes: p.evidence?.slice(0, 120) });
      added++;
    });
    const boot = extraction.eliminated[0];
    if (boot?.player_id) {
      const placement = activePlayers.length;
      setBootId(boot.player_id);
      setBootHadIdol(boot.had_idol);
      setEvent(boot.player_id, 'placement', 1, { placement, notes: `Voted out in episode ${episode}` });
    }
    flash(`${added} events queued.${boot ? ` ${boot.player_name} set as the boot — check the votes in Tribal Council.` : ''}`);
    setShowSources(false);
    document.getElementById('ep-step-tribal')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── review & submit ──
  const reviewRows = useMemo(() => {
    const byPlayer = new Map<number, Pending[]>();
    for (const p of pending) { if (!byPlayer.has(p.player_id)) byPlayer.set(p.player_id, []); byPlayer.get(p.player_id)!.push(p); }
    return [...byPlayer.entries()].map(([pid, evs]) => {
      const total = evs.reduce((s, e) => e.event_type === 'placement' ? s + (castCount + 1 - (e.placement || castCount)) : s + (ruleOf(e.event_type)?.points || 0) * e.count, 0);
      return { player: playerById(pid), events: evs, total };
    }).sort((a, b) => b.total - a.total);
  }, [pending, rules, players, castCount]); // eslint-disable-line react-hooks/exhaustive-deps
  const queued = pending.reduce((n, p) => n + p.count, 0);

  const clearAll = () => { setPending([]); setBootId(0); setVotes({}); setVoters([]); setBootHadIdol(false); setRewardWinner(0); };

  const submit = async () => {
    if (!season || pending.length === 0) return;
    if (!window.confirm(`Submit ${queued} scoring events for episode ${episode}? You can delete individual events afterwards in Scores.`)) return;
    setSubmitting(true);
    try {
      const events: EventInput[] = pending.flatMap(p => Array.from({ length: p.count }, (_, i) => ({
        player_id: p.player_id, event_type: p.event_type, episode,
        notes: i === 0 ? (p.notes || null) : null,
        ...(p.event_type === 'placement' ? { placement: p.placement } : {}),
      })));
      await api.addScoringEvents(season.id, events);
      try {
        const idols = await api.getIdols(season.id);
        for (const p of pending) {
          if (p.event_type === 'finds_idol') await api.addIdol(season.id, { player_id: p.player_id, found_episode: episode });
          if (['correct_idol_play', 'idol_misplay', 'idol_advantage_play'].includes(p.event_type)) {
            const held = idols.find(i => i.player_id === p.player_id && i.is_active);
            if (held) await api.updateIdol(held.id, { played_episode: episode, is_active: false });
          }
        }
      } catch { /* tracker is secondary */ }
      if ((season.current_episode || 0) < episode) await api.updateSeason(season.id, { current_episode: episode });
      await refresh();
      clearAll(); setExtraction(null);
      flash(`Episode ${episode} logged — ${events.length} events. Recap it from the Recaps tab.`);
      setEpisode(episode + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) { flash(err.message, 'error'); } finally { setSubmitting(false); }
  };

  if (!season) return null;

  const Step = ({ n, id, title, hint, children }: { n: number; id: string; title: string; hint: string; children: React.ReactNode }) => (
    <section className="ep-step" id={id}>
      <header className="ep-step-head">
        <span className="ep-step-num">{n}</span>
        <div><h3>{title}</h3><p>{hint}</p></div>
      </header>
      <div className="ep-step-body">{children}</div>
    </section>
  );
  const Grid = ({ type, pool = activePlayers, label }: { type: string; pool?: Player[]; label: string }) => (
    <div className="form-group">
      <label>{label} <span className={`pts-badge ${(ruleOf(type)?.points || 0) < 0 ? 'negative' : 'positive'}`}>{pts(type)} each</span></label>
      <div className="pick-grid">
        {pool.map(p => <PlayerCard key={p.id} player={p} compact selected={countOf(p.id, type) > 0} onClick={() => toggleEvent(p.id, type)} />)}
      </div>
    </div>
  );

  return (
    <div className="admin-tab-content episode-tab">
      <p className="tab-intro">Work top to bottom. Every tap queues a scoring event; nothing is saved until you press <strong>Submit episode {episode}</strong> in the bar at the bottom. Change the episode number in the bar above.</p>

      {/* 0. Sources */}
      <section className="ep-step optional">
        <header className="ep-step-head clickable" onClick={() => setShowSources(s => !s)}>
          <span className="ep-step-num">✨</span>
          <div><h3>Let Claude pre-fill from recaps <span className="text-muted">(optional)</span></h3><p>Paste EW / Parade / Wikipedia links or article text. It proposes events; you tick what's right.</p></div>
          <span className="ep-section-chev">{showSources ? '▾' : '▸'}</span>
        </header>
        {showSources && (
          <div className="ep-step-body">
            <div className="form-row-inline">
              <div className="form-group flex-1">
                <label>Article links (one per line)</label>
                <textarea className="form-textarea" rows={3} value={urls} onChange={e => setUrls(e.target.value)} placeholder={'https://ew.com/…\nhttps://parade.com/…'} />
              </div>
              <div className="form-group flex-1">
                <label>Or paste the recap text</label>
                <textarea className="form-textarea" rows={3} value={pasted} onChange={e => setPasted(e.target.value)} placeholder="Paste an article or your own notes" />
              </div>
            </div>
            <button className="btn btn-secondary" onClick={runExtraction} disabled={extracting}>{extracting ? '🔮 Reading (about 30s)…' : '🔮 Propose scoring events'}</button>
            {extracting && <div className="summary-loading"><div className="summary-spinner" /><p>Reading the sources and matching them to the rules…</p></div>}
            {extraction && (
              <div className="extraction-result">
                <p className="summary-desc"><strong>Summary:</strong> {extraction.summary}</p>
                {extraction.warnings.length > 0 && <ul className="extraction-warnings">{extraction.warnings.map((w, i) => <li key={i}>⚠️ {w}</li>)}</ul>}
                {extraction.eliminated.length > 0 && <p className="summary-desc"><strong>Eliminated:</strong> {extraction.eliminated.map(e => `${e.player_name} (${e.votes_received} votes, ${e.how})`).join('; ')}</p>}
                <div className="rules-table-container">
                  <table className="log-table">
                    <thead><tr><th></th><th>Player</th><th>Event</th><th>×</th><th>Evidence</th><th>Conf.</th></tr></thead>
                    <tbody>
                      {extraction.proposals.map((p, i) => (
                        <tr key={i} className={p.problem ? 'negative-row' : ''}>
                          <td><input type="checkbox" checked={accepted.has(i)} disabled={!(fixes[i] ?? p.player_id) || !has(p.event_type)} onChange={e => setAccepted(s => { const n = new Set(s); e.target.checked ? n.add(i) : n.delete(i); return n; })} /></td>
                          <td>{p.player_id ? p.player_name : (
                            <select className="form-select form-select-sm" value={fixes[i] || 0} onChange={e => setFixes(f => ({ ...f, [i]: parseInt(e.target.value) }))}>
                              <option value={0}>{p.player_name} → ?</option>
                              {players.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                            </select>
                          )}</td>
                          <td>{has(p.event_type) ? eventLabel(p.event_type, rules) : <span className="negative">{p.event_type}</span>}</td>
                          <td>{p.count}</td>
                          <td className="text-muted extraction-evidence">{p.evidence}</td>
                          <td>{p.confidence}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="form-row-inline" style={{ marginTop: '0.75rem', alignItems: 'center' }}>
                  <button className="btn btn-primary" onClick={acceptExtraction} disabled={accepted.size === 0}>Queue {accepted.size} accepted events</button>
                  <span className="text-muted" style={{ fontSize: '0.8rem' }}>{extraction.usage.model} · {extraction.usage.input_tokens.toLocaleString()} in / {extraction.usage.output_tokens.toLocaleString()} out</span>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 1. Challenges */}
      <Step n={1} id="ep-step-challenges" title="Challenges" hint={oneTribe ? 'Tap the immunity winner(s) and the reward winner.' : 'Tap the tribe(s) that were safe, then untick anyone who sat out.'}>
        {!oneTribe && (
          <>
            <div className="form-group">
              <label>Tribe immunity <span className="pts-badge positive">{pts('tribe_wins_immunity', 1)} per player</span></label>
              <div className="challenge-tribe-pills">
                {activeTribes.map(t => (
                  <button key={t.id} className={`tribe-pill ${tribeFullySelected(t.name, 'tribe_wins_immunity') ? 'selected' : ''}`} style={{ '--tribe-color': t.color } as React.CSSProperties} onClick={() => toggleTribe(t.name, 'tribe_wins_immunity')}>
                    {t.name} ({tribeMembers(t.name).length})
                  </button>
                ))}
              </div>
              {pending.some(p => p.event_type === 'tribe_wins_immunity') && (
                <div className="pick-grid" style={{ marginTop: '0.5rem' }}>
                  {activePlayers.filter(p => activeTribes.some(t => t.name === p.tribe && tribeMembers(t.name).some(m => countOf(m.id, 'tribe_wins_immunity') > 0))).map(p => (
                    <PlayerCard key={p.id} player={p} compact selected={countOf(p.id, 'tribe_wins_immunity') > 0} onClick={() => toggleEvent(p.id, 'tribe_wins_immunity')} />
                  ))}
                </div>
              )}
            </div>
            <div className="form-group">
              <label>Tribe reward <span className="pts-badge positive">{pts('tribe_wins_reward', 0.5)} per player</span></label>
              <div className="challenge-tribe-pills">
                {activeTribes.map(t => (
                  <button key={t.id} className={`tribe-pill ${tribeFullySelected(t.name, 'tribe_wins_reward') ? 'selected' : ''}`} style={{ '--tribe-color': t.color } as React.CSSProperties} onClick={() => toggleTribe(t.name, 'tribe_wins_reward')}>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        <Grid type="wins_individual_immunity" label="Individual immunity winner(s)" />
        <div className="form-row-inline">
          <div className="form-group flex-1">
            <label>Individual reward winner <span className="pts-badge positive">{pts('wins_individual_reward', 2)}</span></label>
            <select className="form-select" value={rewardWinner} onChange={e => { const id = parseInt(e.target.value); if (rewardWinner) setEvent(rewardWinner, 'wins_individual_reward', 0); setRewardWinner(id); if (id) setEvent(id, 'wins_individual_reward', 1); }}>
              <option value={0}>— no individual reward this episode —</option>
              {activePlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        {rewardWinner > 0 && <Grid type="chosen_for_reward" pool={activePlayers.filter(p => p.id !== rewardWinner)} label="Brought along on the reward" />}
        {has('goes_on_journey') && <Grid type="goes_on_journey" label="Went on a journey" />}
      </Step>

      {/* 2. Tribal council */}
      <Step n={2} id="ep-step-tribal" title="Tribal Council" hint="Tap who went home. Then count the votes and tap everyone who voted with the majority.">
        <div className="form-group">
          <label>Voted out {bootId ? <span className="pts-badge">→ placement {activePlayers.length} = {formatPoints(castCount + 1 - activePlayers.length)}</span> : <span className="label-hint">(skip if no one went home)</span>}</label>
          <div className="pick-grid">
            {activePlayers.map(p => <PlayerCard key={p.id} player={p} compact selected={bootId === p.id} onClick={() => chooseBoot(p.id)} />)}
          </div>
        </div>
        {bootId > 0 && (
          <>
            <div className="form-group">
              <label>Votes received <span className="pts-badge negative">{pts('receives_votes', -0.25)} per vote</span> <span className="label-hint">— count every vote cast, including the boot's</span></label>
              <div className="vote-tally">
                {atTribal.map(p => (
                  <div key={p.id} className={`vote-row ${p.id === bootId ? 'boot' : ''}`}>
                    <span className="vote-name" style={{ borderLeftColor: getTribeColor(p.tribe) }}>{p.nickname || p.name.split(' ')[0]}{p.id === bootId ? ' · OUT' : ''}</span>
                    <div className="stepper small">
                      <button type="button" onClick={() => setVote(p.id, (votes[p.id] || 0) - 1)}>−</button>
                      <input type="number" min={0} value={votes[p.id] || 0} onChange={e => setVote(p.id, parseInt(e.target.value) || 0)} />
                      <button type="button" onClick={() => setVote(p.id, (votes[p.id] || 0) + 1)}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>In on the vote <span className="pts-badge positive">{pts('in_on_vote', 1)} each</span> <span className="label-hint">— everyone who voted for {playerById(bootId)?.nickname || playerById(bootId)?.name.split(' ')[0]}</span></label>
              <div className="challenge-tribe-pills" style={{ marginBottom: '0.5rem' }}>
                <button className="tribe-pill" onClick={() => setVoterList(atTribal.filter(p => p.id !== bootId && !(votes[p.id] > 0)).map(p => p.id))}>Everyone at tribal who got no votes</button>
                <button className="tribe-pill" onClick={() => setVoterList([])}>Clear</button>
              </div>
              <div className="pick-grid">
                {atTribal.filter(p => p.id !== bootId).map(p => <PlayerCard key={p.id} player={p} compact selected={voters.includes(p.id)} onClick={() => setVoterList(voters.includes(p.id) ? voters.filter(x => x !== p.id) : [...voters, p.id])} />)}
              </div>
            </div>
            {has('voted_out_with_idol') && (
              <label className="form-toggle"><input type="checkbox" checked={bootHadIdol} onChange={e => toggleBootIdol(e.target.checked)} /> <span>Went home with an unplayed idol ({pts('voted_out_with_idol', -5)} for them{has('vote_out_with_idol') ? `, ${pts('vote_out_with_idol', 3)} for each voter` : ''})</span></label>
            )}
          </>
        )}
        <details className="ep-details">
          <summary>Idol or advantage played at tribal</summary>
          {has('correct_idol_play') && <Grid type="correct_idol_play" label="Idol played correctly (votes voided)" />}
          {has('idol_misplay') && <Grid type="idol_misplay" label="Idol misplayed (nothing voided)" />}
          {has('idol_advantage_play') && <Grid type="idol_advantage_play" label="Advantage played" />}
          {has('voted_out_with_advantage') && <Grid type="voted_out_with_advantage" label="Voted out holding an advantage" />}
        </details>
      </Step>

      {/* 3. Finds & milestones */}
      <Step n={3} id="ep-step-milestones" title="Idols, advantages & milestones" hint="Anything found this episode, plus merge / jury when they happen.">
        {has('finds_idol') && <Grid type="finds_idol" label="Found an idol" />}
        {has('finds_advantage') && <Grid type="finds_advantage" label="Found an advantage" />}
        {has('makes_merge') && (
          <div className="form-group">
            <label>Merge <span className="pts-badge positive">{pts('makes_merge', 3)} each</span></label>
            <button className={`btn btn-small ${pending.some(x => x.event_type === 'makes_merge') ? 'btn-primary' : 'btn-secondary'}`} onClick={() => activePlayers.forEach(p => setEvent(p.id, 'makes_merge', pending.some(x => x.event_type === 'makes_merge') ? 0 : 1))}>
              {pending.some(x => x.event_type === 'makes_merge') ? `✓ Merge queued for ${activePlayers.length} players (tap to undo)` : `This is the merge episode — award all ${activePlayers.length} remaining`}
            </button>
          </div>
        )}
        {has('makes_jury') && <Grid type="makes_jury" label="Joins the jury this episode (once per player)" pool={players} />}
        <details className="ep-details" open={showRare} onToggle={e => setShowRare((e.target as HTMLDetailsElement).open)}>
          <summary>Finale & rare events</summary>
          {rules.filter(r => !HANDLED.has(r.event_type)).map(r => <Grid key={r.event_type} type={r.event_type} label={r.description} pool={players} />)}
        </details>
      </Step>

      {/* 4. Review */}
      <Step n={4} id="ep-step-review" title="Review" hint={queued ? `${queued} events queued for episode ${episode}. Remove anything wrong, then submit.` : 'Nothing queued yet.'}>
        {reviewRows.length > 0 && (
          <div className="review-list">
            {reviewRows.map(({ player, events, total }) => player && (
              <div key={player.id} className="review-row">
                <div className="review-player" style={{ borderLeftColor: getTribeColor(player.tribe) }}>
                  <strong>{player.name}</strong>
                  <span className={total >= 0 ? 'positive' : 'negative'}>{formatPoints(total)}</span>
                </div>
                <div className="review-events">
                  {events.map(e => (
                    <span key={e.key} className="review-chip">
                      {e.event_type === 'placement' ? `Voted out · ${e.placement}th place` : eventLabel(e.event_type, rules)}{e.count > 1 ? ` ×${e.count}` : ''}
                      <button onClick={() => { if (e.event_type === 'placement') chooseBoot(e.player_id); else setEvent(e.player_id, e.event_type, 0); }} aria-label="Remove">✕</button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Step>

      <div className="ep-sticky">
        <div className="ep-sticky-inner">
          <div className="ep-sticky-info">
            <strong>Episode {episode}</strong>
            <span>{queued} event{queued === 1 ? '' : 's'} queued · {reviewRows.length} players · {reviewRows.reduce((s, r) => s + r.total, 0).toFixed(2)} pts</span>
          </div>
          <div className="ep-sticky-actions">
            {queued > 0 && <button className="btn btn-secondary btn-small" onClick={() => window.confirm('Clear everything queued?') && clearAll()}>Clear</button>}
            <button className="btn btn-primary" onClick={submit} disabled={queued === 0 || submitting}>{submitting ? 'Saving…' : `🔥 Submit episode ${episode}`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
