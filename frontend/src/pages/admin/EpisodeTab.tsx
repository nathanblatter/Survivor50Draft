import { useMemo, useState } from 'react';
import { api, eventLabel, formatPoints } from '../../api';
import { Player, Extraction, EventInput } from '../../types';
import { useAdmin } from './AdminContext';
import { useTribes } from '../../context/TribeContext';
import PlayerCard from '../../components/PlayerCard';

/** One row in the pending list: a player + event, possibly repeated (votes). */
interface Pending {
  key: string;
  player_id: number;
  event_type: string;
  count: number;
  notes?: string;
  placement?: number;
}

type Section = 'sources' | 'challenges' | 'tribal' | 'milestones' | 'review';

/**
 * Log Episode: build the whole episode's scoring in one place, then submit once (all-or-nothing).
 * Optional first step: let Claude read recap articles and propose the events for review.
 */
export default function EpisodeTab() {
  const { season, players, activePlayers, rules, episode, setEpisode, refresh, flash } = useAdmin();
  const { activeTribes, getTribeColor } = useTribes();
  const [open, setOpen] = useState<Section>('challenges');
  const [pending, setPending] = useState<Pending[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Tribal council scratch state
  const [bootId, setBootId] = useState(0);
  const [bootHadIdol, setBootHadIdol] = useState(false);
  const [votes, setVotes] = useState<Record<number, number>>({});
  const [voters, setVoters] = useState<number[]>([]);
  // Reward scratch
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
  const playerById = (id: number) => players.find(p => p.id === id);
  const castCount = season?.cast_count || players.length;

  // ── pending helpers ──
  const countOf = (pid: number, type: string) => pending.find(p => p.player_id === pid && p.event_type === type)?.count || 0;
  const setEvent = (pid: number, type: string, count: number, extra?: Partial<Pending>) => {
    setPending(prev => {
      const rest = prev.filter(p => !(p.player_id === pid && p.event_type === type));
      if (count <= 0) return rest;
      return [...rest, { key: `${pid}:${type}`, player_id: pid, event_type: type, count, ...extra }];
    });
  };
  const toggleEvent = (pid: number, type: string) => setEvent(pid, type, countOf(pid, type) ? 0 : 1);
  const toggleTribe = (tribeName: string, type: string) => {
    const members = activePlayers.filter(p => p.tribe === tribeName);
    const all = members.every(p => countOf(p.id, type) > 0);
    members.forEach(p => setEvent(p.id, type, all ? 0 : 1));
  };
  const tribeFullySelected = (tribeName: string, type: string) => {
    const members = activePlayers.filter(p => p.tribe === tribeName);
    return members.length > 0 && members.every(p => countOf(p.id, type) > 0);
  };

  // ── tribal council ──
  const applyTribal = () => {
    if (!bootId) { flash('Pick who went home first', 'error'); return; }
    const alreadyBooted = pending.filter(p => p.event_type === 'placement').map(p => p.player_id);
    const placement = activePlayers.length - alreadyBooted.filter(id => id !== bootId).length;
    setEvent(bootId, 'placement', 1, { placement, notes: `Voted out in episode ${episode}` });
    Object.entries(votes).forEach(([pid, n]) => setEvent(parseInt(pid), 'receives_votes', n || 0));
    activePlayers.forEach(p => setEvent(p.id, 'in_on_vote', voters.includes(p.id) && p.id !== bootId ? 1 : 0));
    if (bootHadIdol && has('voted_out_with_idol')) {
      setEvent(bootId, 'voted_out_with_idol', 1);
      if (has('vote_out_with_idol')) voters.filter(v => v !== bootId).forEach(v => setEvent(v, 'vote_out_with_idol', 1));
    }
    flash(`${playerById(bootId)?.name} added as the boot (placement ${placement}). Review below.`);
    setOpen('review');
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
      flash(`Claude proposed ${result.proposals.length} events. Review and accept.`);
    } catch (err: any) { flash(err.message, 'error'); } finally { setExtracting(false); }
  };

  const acceptExtraction = () => {
    if (!extraction) return;
    let added = 0;
    extraction.proposals.forEach((p, i) => {
      if (!accepted.has(i)) return;
      const pid = fixes[i] ?? p.player_id;
      if (!pid || !has(p.event_type) || p.event_type === 'placement') return;
      setEvent(pid, p.event_type, p.count, { notes: p.evidence?.slice(0, 120) });
      added++;
    });
    // Boots: prefill the tribal section rather than committing placement blindly.
    const boot = extraction.eliminated[0];
    if (boot?.player_id) {
      setBootId(boot.player_id);
      setBootHadIdol(boot.had_idol);
      setVotes(v => ({ ...v, [boot.player_id!]: boot.votes_received }));
    }
    flash(`${added} events added to the episode.${boot ? ` ${boot.player_name} pre-filled as the boot — confirm in Tribal Council.` : ''}`);
    setOpen(boot ? 'tribal' : 'review');
  };

  // ── review & submit ──
  const reviewRows = useMemo(() => {
    const byPlayer = new Map<number, Pending[]>();
    for (const p of pending) { if (!byPlayer.has(p.player_id)) byPlayer.set(p.player_id, []); byPlayer.get(p.player_id)!.push(p); }
    return [...byPlayer.entries()].map(([pid, evs]) => {
      const total = evs.reduce((s, e) => {
        if (e.event_type === 'placement') return s + (castCount + 1 - (e.placement || castCount));
        return s + (ruleOf(e.event_type)?.points || 0) * e.count;
      }, 0);
      return { player: playerById(pid), events: evs, total };
    }).sort((a, b) => b.total - a.total);
  }, [pending, rules, players, castCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!season || pending.length === 0) return;
    if (!window.confirm(`Submit ${pending.reduce((n, p) => n + p.count, 0)} scoring events for episode ${episode}?`)) return;
    setSubmitting(true);
    try {
      const events: EventInput[] = pending.flatMap(p => Array.from({ length: p.count }, (_, i) => ({
        player_id: p.player_id, event_type: p.event_type, episode,
        notes: i === 0 ? (p.notes || null) : null,
        ...(p.event_type === 'placement' ? { placement: p.placement } : {}),
      })));
      await api.addScoringEvents(season.id, events);
      // Best-effort tracker sync: idols found → tracker; idol plays → mark played.
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
      setPending([]); setBootId(0); setVotes({}); setVoters([]); setBootHadIdol(false); setRewardWinner(0); setExtraction(null);
      flash(`Episode ${episode} logged — ${events.length} events. Generate the recap in the Recaps tab.`);
      setEpisode(episode + 1);
      setOpen('challenges');
    } catch (err: any) { flash(err.message, 'error'); } finally { setSubmitting(false); }
  };

  if (!season) return null;

  const Head = ({ id, title, sub }: { id: Section; title: string; sub?: string }) => (
    <button className={`ep-section-head ${open === id ? 'open' : ''}`} onClick={() => setOpen(open === id ? 'review' : id)}>
      <span className="ep-section-title">{title}</span>
      {sub && <span className="ep-section-sub">{sub}</span>}
      <span className="ep-section-chev">{open === id ? '▾' : '▸'}</span>
    </button>
  );
  const Grid = ({ type, pool = activePlayers, label }: { type: string; pool?: Player[]; label?: string }) => (
    <div className="form-group">
      {label && <label>{label} <span className="pts-badge positive">{formatPoints(ruleOf(type)?.points || 0)} each</span></label>}
      <div className="bulk-player-grid">
        {pool.map(p => <PlayerCard key={p.id} player={p} compact selected={countOf(p.id, type) > 0} onClick={() => toggleEvent(p.id, type)} />)}
      </div>
    </div>
  );

  return (
    <div className="admin-tab-content episode-tab">
      <div className="ep-banner">
        <div>
          <div className="ep-banner-title">Episode {episode}</div>
          <div className="ep-banner-sub">{season.show_name} {season.season_number} · {activePlayers.length} still in · {pending.reduce((n, p) => n + p.count, 0)} events queued</div>
        </div>
        <button className="btn btn-primary" onClick={submit} disabled={pending.length === 0 || submitting}>
          {submitting ? 'Saving…' : `Submit episode ${episode}`}
        </button>
      </div>

      {/* ── 0. Sources ── */}
      <Head id="sources" title="✨ Draft from recaps (optional)" sub="Paste links or text, Claude proposes the events, you approve" />
      {open === 'sources' && (
        <div className="scoring-form">
          <div className="form-group">
            <label>Article links (one per line) — EW (Dalton Ross), Parade (Mike Bloom), Wikipedia episode page…</label>
            <textarea className="form-textarea" rows={3} value={urls} onChange={e => setUrls(e.target.value)} placeholder={'https://ew.com/...\nhttps://parade.com/...'} />
          </div>
          <div className="form-group">
            <label>Or paste the recap text</label>
            <textarea className="form-textarea" rows={5} value={pasted} onChange={e => setPasted(e.target.value)} placeholder="Paste an article or your own notes" />
          </div>
          <button className="btn btn-secondary" onClick={runExtraction} disabled={extracting}>{extracting ? '🔮 Reading…' : '🔮 Propose scoring events'}</button>
          {extracting && <div className="summary-loading"><div className="summary-spinner" /><p>Reading the sources and matching them to the rules…</p></div>}
          {extraction && (
            <div className="extraction-result">
              <p className="summary-desc"><strong>Summary:</strong> {extraction.summary}</p>
              {extraction.warnings.length > 0 && (
                <ul className="extraction-warnings">{extraction.warnings.map((w, i) => <li key={i}>⚠️ {w}</li>)}</ul>
              )}
              {extraction.eliminated.length > 0 && (
                <p className="summary-desc"><strong>Eliminated:</strong> {extraction.eliminated.map(e => `${e.player_name} (${e.votes_received} votes, ${e.how})`).join('; ')}</p>
              )}
              <div className="rules-table-container">
                <table className="log-table">
                  <thead><tr><th></th><th>Player</th><th>Event</th><th>×</th><th>Evidence</th><th>Conf.</th></tr></thead>
                  <tbody>
                    {extraction.proposals.map((p, i) => (
                      <tr key={i} className={p.problem ? 'negative-row' : ''}>
                        <td><input type="checkbox" checked={accepted.has(i)} disabled={!(fixes[i] ?? p.player_id) || !has(p.event_type)} onChange={e => setAccepted(s => { const n = new Set(s); e.target.checked ? n.add(i) : n.delete(i); return n; })} /></td>
                        <td>
                          {p.player_id ? p.player_name : (
                            <select className="form-select form-select-sm" value={fixes[i] || 0} onChange={e => setFixes(f => ({ ...f, [i]: parseInt(e.target.value) }))}>
                              <option value={0}>{p.player_name} → ?</option>
                              {players.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                            </select>
                          )}
                        </td>
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
                <button className="btn btn-primary" onClick={acceptExtraction} disabled={accepted.size === 0}>Add {accepted.size} accepted events</button>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>{extraction.usage.model} · {extraction.usage.input_tokens.toLocaleString()} in / {extraction.usage.output_tokens.toLocaleString()} out</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 1. Challenges ── */}
      <Head id="challenges" title="🏆 Challenges" sub="Tribe immunity & reward, individual immunity & reward, journeys" />
      {open === 'challenges' && (
        <div className="scoring-form">
          {activeTribes.length > 1 && (
            <>
              <div className="form-group">
                <label>Tribe immunity <span className="pts-badge positive">{formatPoints(ruleOf('tribe_wins_immunity')?.points || 1)} / player</span> — tap the safe tribe(s), then untick sit-outs below</label>
                <div className="challenge-tribe-pills">
                  {activeTribes.map(t => (
                    <button key={t.id} className={`tribe-pill ${tribeFullySelected(t.name, 'tribe_wins_immunity') ? 'selected' : ''}`} style={{ '--tribe-color': t.color } as React.CSSProperties} onClick={() => toggleTribe(t.name, 'tribe_wins_immunity')}>
                      {t.name} ({activePlayers.filter(p => p.tribe === t.name).length})
                    </button>
                  ))}
                </div>
              </div>
              {pending.some(p => p.event_type === 'tribe_wins_immunity') && <Grid type="tribe_wins_immunity" />}
              <div className="form-group">
                <label>Tribe reward <span className="pts-badge positive">{formatPoints(ruleOf('tribe_wins_reward')?.points || 0.5)} / player</span></label>
                <div className="challenge-tribe-pills">
                  {activeTribes.map(t => (
                    <button key={t.id} className={`tribe-pill ${tribeFullySelected(t.name, 'tribe_wins_reward') ? 'selected' : ''}`} style={{ '--tribe-color': t.color } as React.CSSProperties} onClick={() => toggleTribe(t.name, 'tribe_wins_reward')}>
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
              {pending.some(p => p.event_type === 'tribe_wins_reward') && <Grid type="tribe_wins_reward" />}
            </>
          )}
          <Grid type="wins_individual_immunity" label="Individual immunity winner(s)" />
          <div className="form-group">
            <label>Individual reward winner <span className="pts-badge positive">{formatPoints(ruleOf('wins_individual_reward')?.points || 2)}</span></label>
            <select className="form-select" value={rewardWinner} onChange={e => { const id = parseInt(e.target.value); if (rewardWinner) setEvent(rewardWinner, 'wins_individual_reward', 0); setRewardWinner(id); if (id) setEvent(id, 'wins_individual_reward', 1); }}>
              <option value={0}>— none —</option>
              {activePlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {rewardWinner > 0 && <Grid type="chosen_for_reward" pool={activePlayers.filter(p => p.id !== rewardWinner)} label="Brought along on the reward" />}
          {has('goes_on_journey') && <Grid type="goes_on_journey" label="Went on a journey" />}
        </div>
      )}

      {/* ── 2. Tribal council ── */}
      <Head id="tribal" title="🗳️ Tribal Council" sub="Who went home, the votes, who was in on it" />
      {open === 'tribal' && (
        <div className="scoring-form">
          <div className="form-group">
            <label>Voted out</label>
            <div className="bulk-player-grid">
              {activePlayers.map(p => <PlayerCard key={p.id} player={p} compact selected={bootId === p.id} onClick={() => setBootId(bootId === p.id ? 0 : p.id)} />)}
            </div>
          </div>
          {bootId > 0 && (
            <>
              <div className="form-group">
                <label>Votes received at tribal <span className="pts-badge negative">{formatPoints(ruleOf('receives_votes')?.points || -0.25)} per vote</span></label>
                <div className="vote-tally">
                  {activePlayers.filter(p => p.tribe === playerById(bootId)?.tribe || activeTribes.length <= 1).map(p => (
                    <div key={p.id} className={`vote-row ${p.id === bootId ? 'boot' : ''}`}>
                      <span className="vote-name" style={{ borderLeftColor: getTribeColor(p.tribe) }}>{p.nickname || p.name.split(' ')[0]}{p.id === bootId ? ' (out)' : ''}</span>
                      <div className="stepper small">
                        <button type="button" onClick={() => setVotes(v => ({ ...v, [p.id]: Math.max(0, (v[p.id] || 0) - 1) }))}>−</button>
                        <input type="number" min={0} value={votes[p.id] || 0} onChange={e => setVotes(v => ({ ...v, [p.id]: parseInt(e.target.value) || 0 }))} />
                        <button type="button" onClick={() => setVotes(v => ({ ...v, [p.id]: (v[p.id] || 0) + 1 }))}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>In on the vote <span className="pts-badge positive">{formatPoints(ruleOf('in_on_vote')?.points || 1)} each</span> — everyone who voted for {playerById(bootId)?.name.split(' ')[0]}</label>
                <div className="challenge-tribe-pills" style={{ marginBottom: '0.5rem' }}>
                  <button className="tribe-pill" onClick={() => setVoters(activePlayers.filter(p => p.id !== bootId && (activeTribes.length <= 1 || p.tribe === playerById(bootId)?.tribe) && !(votes[p.id] > 0)).map(p => p.id))}>Everyone at tribal who didn't get votes</button>
                  <button className="tribe-pill" onClick={() => setVoters([])}>Clear</button>
                </div>
                <div className="bulk-player-grid">
                  {activePlayers.filter(p => p.id !== bootId).map(p => <PlayerCard key={p.id} player={p} compact selected={voters.includes(p.id)} onClick={() => setVoters(v => v.includes(p.id) ? v.filter(x => x !== p.id) : [...v, p.id])} />)}
                </div>
              </div>
              <label className="form-toggle"><input type="checkbox" checked={bootHadIdol} onChange={e => setBootHadIdol(e.target.checked)} /> <span>Went home with an unplayed idol ({formatPoints(ruleOf('voted_out_with_idol')?.points || -5)} for them, {formatPoints(ruleOf('vote_out_with_idol')?.points || 3)} for each voter)</span></label>
              <button className="btn btn-danger btn-full" style={{ marginTop: '1rem' }} onClick={applyTribal}>🔥 Add tribal council to the episode</button>
            </>
          )}
          <details style={{ marginTop: '1rem' }}>
            <summary className="text-muted">Idol / advantage plays at tribal</summary>
            {has('correct_idol_play') && <Grid type="correct_idol_play" label="Idol played correctly" />}
            {has('idol_misplay') && <Grid type="idol_misplay" label="Idol misplayed" />}
            {has('idol_advantage_play') && <Grid type="idol_advantage_play" label="Advantage / idol played (generic)" />}
            {has('voted_out_with_advantage') && <Grid type="voted_out_with_advantage" label="Voted out holding an advantage" />}
          </details>
        </div>
      )}

      {/* ── 3. Milestones & finds ── */}
      <Head id="milestones" title="🗿 Finds & milestones" sub="Idols/advantages found, merge, jury, finale events" />
      {open === 'milestones' && (
        <div className="scoring-form">
          {has('finds_idol') && <Grid type="finds_idol" label="Found an idol" />}
          {has('finds_advantage') && <Grid type="finds_advantage" label="Found an advantage" />}
          {has('makes_merge') && (
            <div className="form-group">
              <label>Merge <span className="pts-badge positive">{formatPoints(ruleOf('makes_merge')?.points || 3)} each</span></label>
              <button className="btn btn-secondary btn-small" onClick={() => activePlayers.forEach(p => setEvent(p.id, 'makes_merge', pending.some(x => x.event_type === 'makes_merge') ? 0 : 1))}>
                {pending.some(x => x.event_type === 'makes_merge') ? 'Remove merge from everyone' : `It's the merge — award all ${activePlayers.length} remaining`}
              </button>
            </div>
          )}
          {has('makes_jury') && <Grid type="makes_jury" label="Joins the jury (award each player once, the episode they'd be a juror)" pool={players} />}
          <details>
            <summary className="text-muted">Finale & rare events</summary>
            {rules.filter(r => !['placement', 'makes_merge', 'makes_jury', 'finds_idol', 'finds_advantage', 'tribe_wins_immunity', 'tribe_wins_reward', 'wins_individual_immunity', 'wins_individual_reward', 'chosen_for_reward', 'goes_on_journey', 'receives_votes', 'in_on_vote', 'vote_out_with_idol', 'voted_out_with_idol', 'correct_idol_play', 'idol_misplay', 'idol_advantage_play', 'voted_out_with_advantage'].includes(r.event_type)).map(r => (
              <Grid key={r.event_type} type={r.event_type} label={r.description} pool={players} />
            ))}
          </details>
        </div>
      )}

      {/* ── 4. Review ── */}
      <Head id="review" title="✅ Review & submit" sub={`${pending.reduce((n, p) => n + p.count, 0)} events · ${reviewRows.reduce((s, r) => s + r.total, 0).toFixed(2)} pts across the cast`} />
      {open === 'review' && (
        <div className="scoring-form">
          {reviewRows.length === 0 ? (
            <div className="summary-empty"><p>Nothing queued yet. Work through the sections above.</p></div>
          ) : (
            <>
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
                          {e.event_type === 'placement' ? `Placed ${e.placement}` : eventLabel(e.event_type, rules)}{e.count > 1 ? ` ×${e.count}` : ''}
                          <button onClick={() => setEvent(e.player_id, e.event_type, 0)} aria-label="Remove">✕</button>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="form-row-inline" style={{ marginTop: '1rem' }}>
                <button className="btn btn-primary btn-full" onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : `🔥 Submit episode ${episode} (${pending.reduce((n, p) => n + p.count, 0)} events)`}</button>
                <button className="btn btn-secondary" onClick={() => { if (window.confirm('Clear everything queued for this episode?')) { setPending([]); setBootId(0); setVotes({}); setVoters([]); } }}>Clear</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
