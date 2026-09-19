import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, eventLabel, formatPoints } from '../api';
import { Team, ScoringRule, ScoringEvent } from '../types';
import { useAppContext } from '../context/AppContext';
import PlayerCard from '../components/PlayerCard';
import ShareButton from '../components/ShareButton';

export default function ScoreboardPage() {
  const { show, season, league, leagueBase } = useAppContext();
  const [teams, setTeams] = useState<Team[]>([]);
  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [events, setEvents] = useState<ScoringEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'standings' | 'rules' | 'log'>('standings');
  const [logEpisode, setLogEpisode] = useState<number | 'all'>('all');

  useEffect(() => {
    if (!show || !season || !league) return;
    api.getLeagueTeams(league.id).then(setTeams).catch(console.error);
    api.getShowScoringRules(show.slug).then(setRules).catch(console.error);
    api.getSeasonScoringEvents(season.id, { limit: 2000 }).then(setEvents).catch(console.error);
  }, [league, show, season]);

  const episodes = useMemo(
    () => [...new Set(events.map(e => e.episode).filter((e): e is number => e !== null))].sort((a, b) => b - a),
    [events]
  );
  const visibleEvents = logEpisode === 'all' ? events : events.filter(e => e.episode === logEpisode);
  const rosterIds = useMemo(() => new Set(teams.flatMap(t => t.players.map(p => p.id))), [teams]);
  const teamOf = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of teams) for (const p of t.players) m.set(p.id, t.name);
    return m;
  }, [teams]);

  if (!show || !season || !league) return null;

  const showName = show.name.toUpperCase();

  const formatStandingsText = () => {
    const title = `🔥 ${showName} ${season.season_number} — ${league.name} Scoreboard`;
    const divider = '─'.repeat(30);
    const lines = teams.map((t, i) => {
      const medal = i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
      const roster = t.players?.map(p => `  • ${p.name} (${Number(p.total_points).toFixed(1)})`).join('\n') || '';
      return `${medal} ${t.name} — ${t.total_score.toFixed(1)} pts\n   ${t.owner_name}\n${roster}`;
    });
    return `${title}\n${divider}\n${lines.join('\n\n')}\n\n${window.location.origin + leagueBase}`;
  };

  return (
    <div className="scoreboard-page">
      <h1 className="page-title">SCOREBOARD</h1>

      <div className="tab-bar">
        <button className={`tab ${activeTab === 'standings' ? 'active' : ''}`} onClick={() => setActiveTab('standings')}>Standings</button>
        <button className={`tab ${activeTab === 'log' ? 'active' : ''}`} onClick={() => setActiveTab('log')}>Score Log</button>
        <button className={`tab ${activeTab === 'rules' ? 'active' : ''}`} onClick={() => setActiveTab('rules')}>Rules</button>
      </div>

      {activeTab === 'standings' && (
        <div className="standings">
          {teams.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <ShareButton getText={formatStandingsText} label="Share Standings" />
            </div>
          )}
          {teams.length === 0 ? (
            <div className="empty-state">No teams yet. <Link to={`${leagueBase}/draft`}>Start the draft</Link>.</div>
          ) : (
            teams.map((team, idx) => (
              <Link to={`${leagueBase}/team/${team.id}`} key={team.id} className="team-card-link">
                <div className="team-card">
                  <div className="team-rank">
                    {idx === 0 && <span className="crown">👑</span>}
                    <span className="rank-number">#{idx + 1}</span>
                  </div>
                  <div className="team-header">
                    <h3 className="team-name">{team.name}</h3>
                    <p className="team-owner">{team.owner_name}</p>
                  </div>
                  <div className="team-score">
                    <span className="score-value">{team.total_score.toFixed(1)}</span>
                    <span className="score-label">points</span>
                  </div>
                  <div className="team-roster">
                    {team.players?.map(p => <PlayerCard key={p.id} player={p} compact showScore />)}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="rules-table-container">
          <table className="rules-table">
            <thead><tr><th>Event</th><th>Points</th></tr></thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id} className={rule.points < 0 ? 'negative-row' : ''}>
                  <td>{rule.description}</td>
                  <td className={`points-cell ${rule.points < 0 ? 'negative' : 'positive'}`}>
                    {rule.is_variable ? 'Variable' : formatPoints(rule.points)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'log' && (
        <div className="score-log">
          {episodes.length > 0 && (
            <div className="tribe-filters" style={{ marginBottom: '1rem' }}>
              <button className={`tribe-filter ${logEpisode === 'all' ? 'active' : ''}`} onClick={() => setLogEpisode('all')}>All</button>
              {episodes.map(ep => (
                <button key={ep} className={`tribe-filter ${logEpisode === ep ? 'active' : ''}`} onClick={() => setLogEpisode(ep)}>Ep {ep}</button>
              ))}
            </div>
          )}
          {visibleEvents.length === 0 ? (
            <div className="empty-state">No scoring events yet.</div>
          ) : (
            <div className="rules-table-container">
              <table className="log-table">
                <thead>
                  <tr><th>Ep</th><th>Player</th><th>Event</th><th>Points</th><th>Team</th></tr>
                </thead>
                <tbody>
                  {visibleEvents.map(event => (
                    <tr key={event.id} className={rosterIds.has(event.player_id) ? '' : 'undrafted-row'}>
                      <td>{event.episode ?? '—'}</td>
                      <td className="log-player">{event.player_name}</td>
                      <td>{eventLabel(event.event_type, rules)}{event.notes ? <span className="log-note"> — {event.notes}</span> : null}</td>
                      <td className={`points-cell ${event.points >= 0 ? 'positive' : 'negative'}`}>{formatPoints(event.points)}</td>
                      <td className="text-muted">{teamOf.get(event.player_id) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
