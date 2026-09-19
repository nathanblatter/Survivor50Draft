import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { api, ordinal } from '../api';
import { Player, Team, DraftState } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTribes } from '../context/TribeContext';
import { useAppContext } from '../context/AppContext';
import { getInitials } from '../components/PlayerCard';

type Sort = 'tribe' | 'name' | 'seasons';

/**
 * The draft room. League members pick their own team once, then tap castaways to draft.
 * The server enforces snake order when the commissioner has started the draft.
 */
export default function DraftPage() {
  const { isAdmin } = useAuth();
  const { activeTribes, getTribeColor } = useTribes();
  const { season, league, leagueBase } = useAppContext();
  const leagueId = league?.id;
  const storageKey = leagueId ? `fantasydraft_league_${leagueId}_team` : 'fantasydraft_team';

  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [state, setState] = useState<DraftState | null>(null);
  const [myTeam, setMyTeam] = useState<number>(() => parseInt(localStorage.getItem(storageKey) || '0') || 0);
  const [selectedPlayer, setSelectedPlayer] = useState<number>(0);
  const [message, setMessage] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);
  const [tribeFilter, setTribeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('tribe');
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [picking, setPicking] = useState(false);
  const [now, setNow] = useState(Date.now());
  const lastPickCount = useRef<number | null>(null);

  const loadData = useCallback(async () => {
    if (!season || !leagueId) return;
    try {
      const [p, t, s] = await Promise.all([
        api.getSeasonPlayers(season.id, leagueId),
        api.getLeagueTeams(leagueId),
        api.getLeagueDraftState(leagueId),
      ]);
      setPlayers(p);
      setTeams(t);
      setState(s);
    } catch (err) {
      console.error(err);
    }
  }, [season, leagueId]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(interval); clearInterval(tick); };
  }, [loadData]);

  useEffect(() => {
    if (myTeam) localStorage.setItem(storageKey, String(myTeam));
    else localStorage.removeItem(storageKey);
  }, [myTeam, storageKey]);

  const flash = (text: string, kind: 'success' | 'error' = 'success') => {
    setMessage({ text, kind });
    setTimeout(() => setMessage(null), 3500);
  };

  // Announce other people's picks as they land.
  const draftedCount = players.filter(p => p.team_id).length;
  useEffect(() => {
    if (lastPickCount.current !== null && draftedCount > lastPickCount.current) {
      const latest = [...players].filter(p => p.pick_number).sort((a, b) => (b.pick_number || 0) - (a.pick_number || 0))[0];
      const team = teams.find(t => t.id === latest?.team_id);
      if (latest && team && team.id !== myTeam) flash(`${team.name} drafted ${latest.name}`);
    }
    lastPickCount.current = draftedCount;
  }, [draftedCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const available = players.filter(p => !p.team_id);
  const myTeamObj = teams.find(t => t.id === myTeam);
  const selectedPlayerObj = players.find(p => p.id === selectedPlayer);
  const onClock = state?.on_the_clock_team_id ? teams.find(t => t.id === state.on_the_clock_team_id) : null;
  const myTurn = Boolean(state?.is_active && onClock && onClock.id === myTeam);
  const rosterSize = state?.roster_size || 0;
  const totalPicks = state?.total_picks || 0;
  const draftComplete = state?.is_complete || (totalPicks > 0 && draftedCount >= totalPicks);
  const myRosterFull = rosterSize > 0 && (myTeamObj?.players.length || 0) >= rosterSize;
  const canPick = Boolean(myTeam) && !draftComplete && !myRosterFull && (!state?.is_active || myTurn || isAdmin);
  const secondsLeft = state?.pick_deadline ? Math.max(0, Math.round((new Date(state.pick_deadline).getTime() - now) / 1000)) : null;

  const filteredAvailable = useMemo(() => {
    let list = tribeFilter === 'all' ? available : available.filter(p => p.tribe === tribeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.nickname || '').toLowerCase().includes(q) || (p.occupation || '').toLowerCase().includes(q));
    }
    const sorted = [...list];
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'seasons') sorted.sort((a, b) => (b.original_seasons.split(',').filter(Boolean).length) - (a.original_seasons.split(',').filter(Boolean).length) || a.name.localeCompare(b.name));
    else sorted.sort((a, b) => a.tribe.localeCompare(b.tribe) || a.name.localeCompare(b.name));
    return sorted;
  }, [available, tribeFilter, search, sort]);

  const upcoming = useMemo(() => {
    if (!state?.order_set || !state.order.length || draftComplete) return [];
    const order = state.order;
    const out: { pick: number; team: Team | undefined }[] = [];
    for (let n = state.current_pick; n < state.current_pick + Math.min(6, order.length) && n <= totalPicks; n++) {
      const round = Math.floor((n - 1) / order.length);
      const idx = (n - 1) % order.length;
      const reversed = state.snake_draft !== false && round % 2 === 1;
      const teamId = order[reversed ? order.length - 1 - idx : idx];
      out.push({ pick: n, team: teams.find(t => t.id === teamId) });
    }
    return out;
  }, [state, teams, totalPicks, draftComplete]);

  const recentPicks = useMemo(() =>
    [...players].filter(p => p.pick_number).sort((a, b) => (b.pick_number || 0) - (a.pick_number || 0)).slice(0, 8),
  [players]);

  const handlePick = async () => {
    if (!myTeam || !selectedPlayer || !leagueId) return;
    setPicking(true);
    try {
      await api.makeLeaguePick(leagueId, myTeam, selectedPlayer, isAdmin && !myTurn);
      flash(`${selectedPlayerObj?.name} drafted to ${myTeamObj?.name}!`);
      setSelectedPlayer(0);
      await loadData();
    } catch (err: any) {
      flash(err.message, 'error');
    } finally {
      setPicking(false);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !newOwnerName.trim() || !leagueId) return;
    try {
      const newTeam = await api.createLeagueTeam(leagueId, { name: newTeamName.trim(), owner_name: newOwnerName.trim() });
      setMyTeam(newTeam.id);
      setNewTeamName('');
      setNewOwnerName('');
      setShowCreateTeam(false);
      await loadData();
      flash('Team created. You are in.');
    } catch (err: any) {
      flash(err.message, 'error');
    }
  };

  const adminAction = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); await loadData(); flash(ok); } catch (err: any) { flash(err.message, 'error'); }
  };

  if (!season || !league) return null;

  return (
    <div className="draft-page">
      <h1 className="page-title">THE DRAFT</h1>
      <p className="page-subtitle">
        {rosterSize > 0 ? `${teams.length} teams · ${rosterSize} picks each · snake order` : `${teams.length} team${teams.length === 1 ? '' : 's'} so far`}
      </p>

      {/* Status strip */}
      <div className={`draft-status-strip ${draftComplete ? 'complete' : state?.is_active ? 'live' : ''}`}>
        <div className="draft-progress">
          <div className="draft-progress-bar">
            <div className="draft-progress-fill" style={{ width: `${totalPicks ? (draftedCount / totalPicks) * 100 : 0}%` }} />
          </div>
          <p className="draft-progress-text">
            {draftComplete
              ? `Draft complete — ${draftedCount} castaways claimed.`
              : totalPicks
                ? `Pick ${Math.min(draftedCount + 1, totalPicks)} of ${totalPicks}${state?.round ? ` · Round ${state.round}` : ''}`
                : `${draftedCount} drafted · ${available.length} available`}
          </p>
        </div>
        {!draftComplete && (
          <div className="draft-clock">
            {state?.is_active && onClock ? (
              <>
                <span className="draft-clock-label">On the clock</span>
                <span className={`draft-clock-team ${myTurn ? 'mine' : ''}`}>{myTurn ? 'YOU' : onClock.name}</span>
                {secondsLeft !== null && <span className={`draft-clock-timer ${secondsLeft <= 10 ? 'urgent' : ''}`}>{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</span>}
              </>
            ) : (
              <span className="draft-clock-label">{state?.order_set ? 'Waiting for the commissioner to start' : 'Open drafting — no turn order yet'}</span>
            )}
          </div>
        )}
      </div>

      {message && <div className={`toast ${message.kind}`}>{message.text}</div>}

      {/* Admin controls */}
      {isAdmin && (
        <div className="draft-admin-bar">
          <span className="draft-admin-label">Commissioner</span>
          {!state?.order_set || teams.length === 0 ? (
            <button className="btn btn-secondary btn-small" disabled={teams.length < 2} onClick={() => adminAction(() => api.setDraftOrder(leagueId!, { randomize: true }), 'Draft order randomized')}>🎲 Randomize order</button>
          ) : (
            <button className="btn btn-secondary btn-small" onClick={() => adminAction(() => api.setDraftOrder(leagueId!, { randomize: true }), 'Draft order re-randomized')}>🎲 Re-randomize</button>
          )}
          {state?.is_active ? (
            <button className="btn btn-secondary btn-small" onClick={() => adminAction(() => api.pauseLeagueDraft(leagueId!), 'Draft paused')}>⏸ Pause</button>
          ) : (
            !draftComplete && <button className="btn btn-primary btn-small" disabled={!state?.order_set || teams.length < 2} onClick={() => adminAction(() => api.startLeagueDraft(leagueId!), 'Draft is live!')}>▶ Start live draft</button>
          )}
          <label className="draft-admin-field">
            Picks each
            <input type="number" min={1} max={20} className="form-input form-input-sm" defaultValue={rosterSize || ''} key={rosterSize}
              onBlur={e => { const v = parseInt(e.target.value); if (v && v !== rosterSize) adminAction(() => api.setDraftOrder(leagueId!, { roster_size: v }), `Roster size set to ${v}`); }} />
          </label>
          <label className="draft-admin-field">
            Sec/pick
            <input type="number" min={0} step={15} className="form-input form-input-sm" defaultValue={state?.seconds_per_pick || ''} key={state?.seconds_per_pick || 0} placeholder="off"
              onBlur={e => { const v = parseInt(e.target.value) || null; if (v !== (state?.seconds_per_pick || null)) adminAction(() => api.setDraftOrder(leagueId!, { seconds_per_pick: v }), v ? `${v}s pick clock` : 'Pick clock off'); }} />
          </label>
          <button className="btn btn-danger btn-small" onClick={() => { if (window.confirm('Reset the entire draft? This removes ALL picks.')) adminAction(() => api.resetLeagueDraft(leagueId!), 'Draft reset'); }}>Reset</button>
        </div>
      )}

      <div className="draft-layout">
        {/* ── Left: identity + player pool ── */}
        <div className="draft-main">
          {/* Step 1: who are you */}
          {!draftComplete && (
            <div className="draft-step">
              <div className="draft-step-header">
                <span className="step-number">{myTeam ? '✓' : '1'}</span>
                <span className="step-label">{myTeam ? `You are ${myTeamObj?.name || '…'}` : 'Which team are you?'}</span>
                {myTeam > 0 && <button className="step-change-btn" onClick={() => setMyTeam(0)}>Change</button>}
              </div>
              {!myTeam && (
                <div className="team-picker">
                  {teams.map(t => (
                    <button key={t.id} className="team-pick-btn" onClick={() => setMyTeam(t.id)}>
                      <strong>{t.name}</strong>
                      <span>{t.owner_name}</span>
                      <span className="team-pick-count">{t.players?.length || 0}{rosterSize ? `/${rosterSize}` : ''} picks</span>
                    </button>
                  ))}
                  {!showCreateTeam ? (
                    <button className="team-pick-btn team-pick-add" onClick={() => setShowCreateTeam(true)} disabled={Boolean(state?.is_active)}>
                      <strong>+ New Team</strong>
                      <span>{state?.is_active ? 'Draft already started' : 'Create your team'}</span>
                    </button>
                  ) : (
                    <form onSubmit={handleCreateTeam} className="team-create-inline">
                      <input type="text" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} className="form-input" placeholder="Team name" maxLength={60} autoFocus />
                      <input type="text" value={newOwnerName} onChange={e => setNewOwnerName(e.target.value)} className="form-input" placeholder="Your name" maxLength={40} />
                      <div className="team-create-actions">
                        <button type="submit" className="btn btn-primary btn-small">Create</button>
                        <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowCreateTeam(false)}>Cancel</button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2: the pool */}
          {myTeam > 0 && !draftComplete && (
            <div className="draft-step">
              <div className="draft-step-header">
                <span className="step-number">{selectedPlayer ? '✓' : '2'}</span>
                <span className="step-label">
                  {myRosterFull ? 'Your roster is full' : selectedPlayer ? `Selected ${selectedPlayerObj?.name}` : canPick ? 'Tap a castaway to draft' : `Waiting for ${onClock?.name || 'your turn'}…`}
                </span>
              </div>
              <div className="draft-pool-controls">
                <input type="search" className="form-input" placeholder="Search castaways…" value={search} onChange={e => setSearch(e.target.value)} />
                <div className="tribe-filters compact">
                  <button className={`tribe-filter ${tribeFilter === 'all' ? 'active' : ''}`} onClick={() => setTribeFilter('all')}>All</button>
                  {activeTribes.map(tribe => (
                    <button key={tribe.name} className={`tribe-filter ${tribeFilter === tribe.name ? 'active' : ''}`} onClick={() => setTribeFilter(tribe.name)} style={{ '--tribe-color': tribe.color } as React.CSSProperties}>
                      {tribe.name}
                    </button>
                  ))}
                </div>
                <select className="form-select form-select-sm" value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort">
                  <option value="tribe">By tribe</option>
                  <option value="name">By name</option>
                  <option value="seasons">Returnees first</option>
                </select>
              </div>
              <div className="draft-pool">
                {filteredAvailable.map(p => {
                  const color = getTribeColor(p.tribe);
                  const isSel = selectedPlayer === p.id;
                  return (
                    <button
                      key={p.id}
                      className={`draft-pool-card ${isSel ? 'selected' : ''}`}
                      style={{ '--tribe-color': color } as React.CSSProperties}
                      onClick={() => canPick && setSelectedPlayer(isSel ? 0 : p.id)}
                      disabled={!canPick}
                    >
                      <div className="draft-pool-photo">
                        {p.photo_url ? <img src={p.photo_url} alt="" loading="lazy" /> : <span>{getInitials(p.name)}</span>}
                      </div>
                      <div className="draft-pool-info">
                        <div className="draft-pool-name">{p.name}</div>
                        <div className="draft-pool-meta">
                          <span style={{ color }}>{p.tribe}</span>
                          {p.original_seasons ? ` · S${p.original_seasons}` : p.occupation ? ` · ${p.occupation}` : ''}
                        </div>
                        {p.hometown && <div className="draft-pool-sub">{p.hometown}</div>}
                      </div>
                    </button>
                  );
                })}
                {filteredAvailable.length === 0 && <div className="empty-state">No castaways match.</div>}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: order, feed, board ── */}
        <aside className="draft-side">
          {upcoming.length > 0 && (
            <div className="draft-side-card">
              <h3>Up next</h3>
              <ol className="draft-upcoming">
                {upcoming.map(u => (
                  <li key={u.pick} className={u.team?.id === myTeam ? 'mine' : ''}>
                    <span className="draft-upcoming-pick">#{u.pick}</span>
                    <span>{u.team?.name || '—'}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {recentPicks.length > 0 && (
            <div className="draft-side-card">
              <h3>Latest picks</h3>
              <ul className="draft-feed">
                {recentPicks.map(p => {
                  const t = teams.find(t => t.id === p.team_id);
                  return (
                    <li key={p.id}>
                      <span className="draft-feed-pick">#{p.pick_number}</span>
                      <span className="draft-feed-player" style={{ color: getTribeColor(p.tribe) }}>{p.nickname || p.name.split(' ')[0]}</span>
                      <span className="draft-feed-team">{t?.name}</span>
                      {isAdmin && <button onClick={() => adminAction(() => api.undoLeaguePick(leagueId!, p.id), 'Pick undone')} className="btn-icon delete-btn" title="Undo">✕</button>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* Draft board */}
      {teams.length > 0 && (
        <section className="section">
          <h2 className="section-title">Draft Board</h2>
          <div className="draft-board">
            {[...teams].sort((a, b) => (a.draft_order || 99) - (b.draft_order || 99)).map(team => (
              <div key={team.id} className={`draft-team-column ${myTeam === team.id ? 'my-team' : ''} ${onClock?.id === team.id && state?.is_active ? 'on-clock' : ''}`}>
                <div className="draft-team-header">
                  <div>
                    <h3>{team.draft_order ? <span className="draft-team-order">{ordinal(team.draft_order)}</span> : null}{team.name}</h3>
                    <span className="draft-team-owner">{team.owner_name} · {team.players?.length || 0}{rosterSize ? `/${rosterSize}` : ''}</span>
                  </div>
                  {isAdmin && (
                    <button onClick={() => { if (window.confirm(`Delete ${team.name} and all its picks?`)) adminAction(() => api.deleteTeam(team.id), 'Team deleted'); }} className="btn-icon delete-btn" title="Delete team">✕</button>
                  )}
                </div>
                <div className="draft-picks-list">
                  {(!team.players || team.players.length === 0) ? (
                    <div className="draft-empty-slot">No picks yet</div>
                  ) : (
                    team.players.map((p, idx) => (
                      <div key={p.id} className="draft-pick-item" style={{ borderLeftColor: getTribeColor(p.tribe) }}>
                        <span className="draft-pick-num">R{idx + 1}</span>
                        <span className="draft-pick-name">{p.name}</span>
                        <span className="draft-pick-tribe" style={{ color: getTribeColor(p.tribe) }}>{p.tribe}</span>
                      </div>
                    ))
                  )}
                  {rosterSize > (team.players?.length || 0) && Array.from({ length: rosterSize - (team.players?.length || 0) }).map((_, i) => (
                    <div key={`empty-${i}`} className="draft-empty-slot small">R{(team.players?.length || 0) + i + 1}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {draftComplete && <a href={`${leagueBase}/scoreboard`} className="view-all-link">See the scoreboard &rarr;</a>}
        </section>
      )}

      {/* Sticky confirm bar */}
      {myTeam > 0 && selectedPlayer > 0 && !draftComplete && (
        <div className="draft-sticky-bar">
          <div className="draft-sticky-inner">
            <div className="draft-sticky-info">
              <span className="draft-sticky-player">{selectedPlayerObj?.name}</span>
              <span className="draft-sticky-arrow">→</span>
              <span className="draft-sticky-team">{myTeamObj?.name}</span>
            </div>
            <button onClick={handlePick} className="btn btn-primary draft-confirm-btn" disabled={picking}>
              {picking ? 'Drafting…' : '🔥 Confirm Pick'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
