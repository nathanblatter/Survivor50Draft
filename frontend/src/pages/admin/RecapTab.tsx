import { useEffect, useState } from 'react';
import { api, eventLabel, formatPoints } from '../../api';
import { ScoringEvent, Team } from '../../types';
import { useAdmin } from './AdminContext';

export default function RecapTab() {
  const { league, rules, episode, flash } = useAdmin();
  const [episodes, setEpisodes] = useState<{ episode: number; event_count: number }[]>([]);
  const [selectedEp, setSelectedEp] = useState<number>(0);
  const [events, setEvents] = useState<ScoringEvent[]>([]);
  const [summary, setSummary] = useState('');
  const [epLoading, setEpLoading] = useState(false);
  const [copied, setCopied] = useState<'ep' | 'team' | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState(0);
  const [recap, setRecap] = useState('');
  const [recapLoading, setRecapLoading] = useState(false);

  useEffect(() => {
    if (!league) return;
    api.getLeagueEpisodesWithEvents(league.id).then(eps => {
      setEpisodes(eps);
      const latest = eps.find(e => e.episode === episode - 1) || eps[eps.length - 1];
      setSelectedEp(latest?.episode || 0);
    }).catch(console.error);
    api.getLeagueTeams(league.id).then(setTeams).catch(console.error);
  }, [league?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (league && selectedEp) api.getLeagueEpisodeEvents(league.id, selectedEp).then(setEvents).catch(console.error);
    else setEvents([]);
    setSummary('');
  }, [league?.id, selectedEp]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = (text: string, which: 'ep' | 'team') => {
    navigator.clipboard.writeText(text).then(() => { setCopied(which); setTimeout(() => setCopied(null), 2000); }).catch(() => {});
  };

  const generateEpisode = async () => {
    if (!league || !selectedEp) return;
    setEpLoading(true); setSummary('');
    try { setSummary((await api.generateLeagueEpisodeSummary(league.id, selectedEp)).summary); }
    catch (err: any) { flash(err.message, 'error'); }
    finally { setEpLoading(false); }
  };

  const generateTeam = async () => {
    if (!league || !teamId) return;
    setRecapLoading(true); setRecap('');
    try { setRecap((await api.generateTeamSeasonRecap(league.id, teamId)).recap); flash('Recap saved to the team page'); }
    catch (err: any) { flash(err.message, 'error'); }
    finally { setRecapLoading(false); }
  };

  if (!league) return <div className="summary-empty"><p>Select a league in the bar above.</p></div>;

  return (
    <div className="admin-tab-content">
      <div className="scoring-form">
        <h3>📺 Episode recap for {league.name}</h3>
        <p className="summary-desc">A dramatic, funny recap to paste into the group chat. Written from that episode's scoring events and this league's standings.</p>
        {episodes.length === 0 ? (
          <div className="summary-empty"><p>No episodes with scoring events yet. Log one first.</p></div>
        ) : (
          <div className="form-row-inline" style={{ alignItems: 'flex-end' }}>
            <div className="form-group">
              <label>Episode</label>
              <select value={selectedEp} onChange={e => setSelectedEp(parseInt(e.target.value))} className="form-select">
                {episodes.map(ep => <option key={ep.episode} value={ep.episode}>Episode {ep.episode} ({ep.event_count} events)</option>)}
              </select>
            </div>
            <button onClick={generateEpisode} className="btn btn-primary" disabled={epLoading || !selectedEp}>
              {epLoading ? '🔮 Writing...' : '🔥 Generate recap'}
            </button>
          </div>
        )}
        {epLoading && <div className="summary-loading"><div className="summary-spinner" /><p>Channeling Jeff Probst...</p></div>}
        {summary && (
          <div className="summary-result">
            <div className="summary-header">
              <h3>Episode {selectedEp}</h3>
              <button onClick={() => copy(summary, 'ep')} className="btn btn-copy">{copied === 'ep' ? '✅ Copied' : '📋 Copy'}</button>
            </div>
            <div className="summary-output">{summary}</div>
          </div>
        )}
        {selectedEp > 0 && events.length > 0 && (
          <details style={{ marginTop: '1rem' }}>
            <summary className="text-muted">Raw scoring data — episode {selectedEp} ({events.length})</summary>
            <table className="log-table" style={{ marginTop: '0.5rem' }}>
              <thead><tr><th>Player</th><th>Event</th><th>Pts</th><th>Notes</th></tr></thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev.id}><td>{ev.player_name}</td><td>{eventLabel(ev.event_type, rules)}</td><td className={ev.points >= 0 ? 'positive' : 'negative'}>{formatPoints(ev.points)}{ev.is_neutral && <span className="neutral-badge">pre-draft</span>}</td><td>{ev.notes || '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>

      <div className="scoring-form">
        <h3>🏆 End-of-season team story</h3>
        <p className="summary-desc">Personalized full-season recap for one team. Saved to their team page and the season recap page.</p>
        {teams.length === 0 ? <div className="summary-empty"><p>No teams in this league.</p></div> : (
          <div className="form-row-inline" style={{ alignItems: 'flex-end' }}>
            <div className="form-group flex-1">
              <label>Team</label>
              <select value={teamId} onChange={e => { setTeamId(parseInt(e.target.value)); setRecap(''); }} className="form-select">
                <option value={0}>-- Choose a team --</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.owner_name}) — {t.total_score.toFixed(1)} pts</option>)}
              </select>
            </div>
            <button onClick={generateTeam} className="btn btn-primary" disabled={recapLoading || !teamId}>{recapLoading ? '🔮 Writing...' : 'Write story'}</button>
          </div>
        )}
        {recapLoading && <div className="summary-loading"><div className="summary-spinner" /><p>Reviewing the whole season...</p></div>}
        {recap && (
          <div className="summary-result">
            <div className="summary-header">
              <h3>{teams.find(t => t.id === teamId)?.name}</h3>
              <button onClick={() => copy(recap, 'team')} className="btn btn-copy">{copied === 'team' ? '✅ Copied' : '📋 Copy'}</button>
            </div>
            <div className="summary-output">{recap}</div>
          </div>
        )}
      </div>
    </div>
  );
}
