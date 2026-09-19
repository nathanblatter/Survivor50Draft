import { useEffect, useState } from 'react';
import { api, eventLabel, formatPoints } from '../../api';
import { ScoringEvent, ScoringRule } from '../../types';
import { useAdmin } from './AdminContext';
import PlayerCard from '../../components/PlayerCard';

/**
 * Manual scoring: one-off events, bulk events, the event log with delete, and the rules editor.
 * The weekly flow lives in the Log Episode tab; this is for corrections and rare events.
 */
export default function ScoresTab() {
  const { season, show, players, activePlayers, rules, episode, refresh, flash } = useAdmin();
  const [events, setEvents] = useState<ScoringEvent[]>([]);
  const [logEpisode, setLogEpisode] = useState<number | 'all'>('all');
  const [selectedPlayers, setSelectedPlayers] = useState<number[]>([]);
  const [eventType, setEventType] = useState('');
  const [placement, setPlacement] = useState('');
  const [ep, setEp] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [editing, setEditing] = useState<ScoringRule | null>(null);
  const [newRule, setNewRule] = useState({ event_type: '', points: '', description: '', is_variable: false });

  useEffect(() => { setEp(String(episode || '')); }, [episode]);

  const loadEvents = () => {
    if (season) api.getSeasonScoringEvents(season.id, { limit: 300, ...(logEpisode !== 'all' ? { episode: logEpisode } : {}) }).then(setEvents).catch(console.error);
  };
  useEffect(loadEvents, [season?.id, logEpisode]); // eslint-disable-line react-hooks/exhaustive-deps

  const rule = rules.find(r => r.event_type === eventType);
  const isPlacement = eventType === 'placement';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!season || selectedPlayers.length === 0 || !eventType) { flash('Pick at least one player and an event', 'error'); return; }
    if (isPlacement && (selectedPlayers.length !== 1 || !placement)) { flash('Placement applies to exactly one player', 'error'); return; }
    setBusy(true);
    try {
      const inserted = await api.addScoringEvents(season.id, selectedPlayers.map(pid => ({
        player_id: pid, event_type: eventType, episode: ep ? parseInt(ep) : null, notes: notes || null,
        ...(isPlacement ? { placement: parseInt(placement) } : {}),
      })));
      flash(`Added ${inserted.length} event${inserted.length === 1 ? '' : 's'}: ${eventLabel(eventType, rules)}`);
      setSelectedPlayers([]); setEventType(''); setNotes(''); setPlacement('');
      loadEvents(); refresh();
    } catch (err: any) { flash(err.message, 'error'); } finally { setBusy(false); }
  };

  const deleteEvent = async (ev: ScoringEvent) => {
    if (!window.confirm(`Delete "${eventLabel(ev.event_type, rules)}" for ${ev.player_name}?`)) return;
    try { await api.deleteScoringEvent(ev.id); loadEvents(); refresh(); flash('Event deleted'); } catch (err: any) { flash(err.message, 'error'); }
  };

  const saveRule = async () => {
    if (!editing) return;
    try {
      await api.updateScoringRule(editing.id, { event_type: editing.event_type, points: editing.points, description: editing.description, is_variable: editing.is_variable });
      setEditing(null); refresh(); flash('Rule saved');
    } catch (err: any) { flash(err.message, 'error'); }
  };

  const createRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!show || !newRule.event_type || !newRule.description || newRule.points === '') return;
    try {
      await api.createShowScoringRule(show.slug, { event_type: newRule.event_type.trim().toLowerCase().replace(/\s+/g, '_'), points: parseFloat(newRule.points), description: newRule.description, is_variable: newRule.is_variable });
      setNewRule({ event_type: '', points: '', description: '', is_variable: false });
      refresh(); flash('Rule created');
    } catch (err: any) { flash(err.message, 'error'); }
  };

  const deleteRule = async (r: ScoringRule) => {
    if (!window.confirm(`Delete rule "${r.description}"? Existing events keep their points.`)) return;
    try { await api.deleteScoringRule(r.id); refresh(); flash('Rule deleted'); } catch (err: any) { flash(err.message, 'error'); }
  };

  const episodesInLog = [...new Set(events.map(e => e.episode).filter((x): x is number => x !== null))].sort((a, b) => b - a);
  const pool = selectedPlayers.length && isPlacement ? players : (eventType === 'votes_for_winner' || eventType === 'placement' ? players : activePlayers);

  return (
    <div className="admin-tab-content">
      <form onSubmit={submit} className="scoring-form">
        <h3>Add a score</h3>
        <div className="form-group">
          <label>Event</label>
          <select value={eventType} onChange={e => { setEventType(e.target.value); if (e.target.value === 'placement') setSelectedPlayers(s => s.slice(0, 1)); }} className="form-select">
            <option value="">-- Select event --</option>
            {rules.map(r => <option key={r.event_type} value={r.event_type}>{r.description} ({r.is_variable ? 'variable' : formatPoints(r.points)})</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>{isPlacement ? 'Player' : `Players (${selectedPlayers.length} selected — tap to toggle)`}</label>
          <div className="bulk-player-grid">
            {pool.map(p => (
              <PlayerCard key={p.id} player={p} compact selected={selectedPlayers.includes(p.id)}
                onClick={() => setSelectedPlayers(prev => isPlacement ? [p.id] : prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])} />
            ))}
          </div>
        </div>
        {isPlacement && (
          <div className="form-group">
            <label>Placement (1 = winner, {season?.cast_count} = first boot)</label>
            <input type="number" min={1} max={season?.cast_count} value={placement} onChange={e => setPlacement(e.target.value)} className="form-input" style={{ maxWidth: 140 }} />
            {placement && season && <div className="placement-preview">= {season.cast_count + 1 - parseInt(placement)} pts, marks the player out (unless 1st)</div>}
          </div>
        )}
        <div className="form-row-inline">
          <div className="form-group">
            <label>Episode</label>
            <input type="number" min={1} value={ep} onChange={e => setEp(e.target.value)} className="form-input" style={{ maxWidth: 100 }} />
          </div>
          <div className="form-group flex-1">
            <label>Notes (optional)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className="form-input" placeholder="Shows up in the log and recaps" />
          </div>
        </div>
        {rule && !rule.is_variable && selectedPlayers.length > 0 && (
          <div className="points-preview">{selectedPlayers.length} × {formatPoints(rule.points)} = {formatPoints(selectedPlayers.length * rule.points)}</div>
        )}
        <button type="submit" className="btn btn-primary btn-full" disabled={busy || !eventType || selectedPlayers.length === 0}>
          🔥 Add score{selectedPlayers.length > 1 ? 's' : ''}
        </button>
      </form>

      <div className="recent-events">
        <h3>Scoring log</h3>
        <div className="tribe-filters compact" style={{ padding: '0.75rem 1rem' }}>
          <button className={`tribe-filter ${logEpisode === 'all' ? 'active' : ''}`} onClick={() => setLogEpisode('all')}>All</button>
          {episodesInLog.map(e => <button key={e} className={`tribe-filter ${logEpisode === e ? 'active' : ''}`} onClick={() => setLogEpisode(e)}>Ep {e}</button>)}
        </div>
        <div className="rules-table-container">
          <table className="log-table">
            <thead><tr><th>Ep</th><th>Player</th><th>Event</th><th>Pts</th><th>Notes</th><th></th></tr></thead>
            <tbody>
              {events.map(ev => (
                <tr key={ev.id}>
                  <td>{ev.episode ?? '—'}</td>
                  <td>{ev.player_name}</td>
                  <td>{eventLabel(ev.event_type, rules)}</td>
                  <td className={ev.points >= 0 ? 'positive' : 'negative'}>{formatPoints(ev.points)}</td>
                  <td className="text-muted">{ev.notes || ''}</td>
                  <td><button onClick={() => deleteEvent(ev)} className="btn-icon delete-btn" title="Delete">✕</button></td>
                </tr>
              ))}
              {events.length === 0 && <tr><td colSpan={6} className="text-muted">No events yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rules-manager">
        <div className="rules-manager-header" onClick={() => setShowRules(!showRules)}>
          <h3>⚙️ Scoring rules ({rules.length}) — shared by every {show?.name} season</h3>
          <span className="rules-toggle">{showRules ? '▼' : '▶'}</span>
        </div>
        {showRules && (
          <div className="rules-manager-content">
            <div className="rules-table-container">
              <table className="log-table rules-table">
                <thead><tr><th>Event type</th><th>Points</th><th>Description</th><th>Var</th><th></th></tr></thead>
                <tbody>
                  {rules.map(r => (
                    <tr key={r.id}>
                      {editing?.id === r.id ? (
                        <>
                          <td><input className="form-input form-input-sm" value={editing.event_type} onChange={e => setEditing({ ...editing, event_type: e.target.value })} /></td>
                          <td><input type="number" step="0.25" className="form-input form-input-sm" style={{ width: 80 }} value={editing.points} onChange={e => setEditing({ ...editing, points: parseFloat(e.target.value) })} /></td>
                          <td><input className="form-input form-input-sm" value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} /></td>
                          <td><input type="checkbox" checked={editing.is_variable} onChange={e => setEditing({ ...editing, is_variable: e.target.checked })} /></td>
                          <td className="rules-actions">
                            <button onClick={saveRule} className="btn btn-primary btn-small">Save</button>
                            <button onClick={() => setEditing(null)} className="btn btn-secondary btn-small">✕</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td><code>{r.event_type}</code></td>
                          <td className={r.points >= 0 ? 'positive' : 'negative'}>{formatPoints(r.points)}</td>
                          <td>{r.description}</td>
                          <td>{r.is_variable ? '✓' : ''}</td>
                          <td className="rules-actions">
                            <button onClick={() => setEditing({ ...r })} className="btn btn-secondary btn-small">Edit</button>
                            <button onClick={() => deleteRule(r)} className="btn-icon delete-btn" title="Delete">✕</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form onSubmit={createRule} className="new-rule-form">
              <h4>Add a rule</h4>
              <div className="form-row-inline">
                <div className="form-group"><label>Event type</label><input className="form-input" value={newRule.event_type} onChange={e => setNewRule({ ...newRule, event_type: e.target.value })} placeholder="wins_reward" /></div>
                <div className="form-group"><label>Points</label><input type="number" step="0.25" className="form-input" style={{ width: 100 }} value={newRule.points} onChange={e => setNewRule({ ...newRule, points: e.target.value })} /></div>
                <div className="form-group flex-1"><label>Description</label><input className="form-input" value={newRule.description} onChange={e => setNewRule({ ...newRule, description: e.target.value })} placeholder="Wins a reward challenge" /></div>
              </div>
              <button type="submit" className="btn btn-primary btn-small">+ Add rule</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
