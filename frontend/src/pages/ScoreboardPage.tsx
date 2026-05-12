import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Team, ScoringRule, ScoringEvent } from '../types';
import { useAppContext } from '../context/AppContext';
import PlayerCard from '../components/PlayerCard';
import ShareButton from '../components/ShareButton';

export default function ScoreboardPage() {
  const { show, season, league } = useAppContext();
  const [teams, setTeams] = useState<Team[]>([]);
  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [events, setEvents] = useState<ScoringEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'standings' | 'rules' | 'log'>('standings');

  const leagueBase = show && season && league
    ? `/${show.slug}/${season.season_number}/leagues/${league.invite_code}`
    : '';

  useEffect(() => {
    if (league) {
      api.getLeagueTeams(league.id).then(setTeams).catch(console.error);
    } else {
      api.getTeams().then(setTeams).catch(console.error);
    }
    if (show) {
      api.getShowScoringRules(show.slug).then(setRules).catch(console.error);
    } else {
      api.getScoringRules().then(setRules).catch(console.error);
    }
    if (season) {
      api.getSeasonScoringEvents(season.id, 100).then(setEvents).catch(console.error);
    } else {
      api.getScoringEvents(100).then(setEvents).catch(console.error);
    }
  }, [league, show, season]);

  const showName = show ? show.name.toUpperCase() : 'FANTASY';
  const seasonNum = season ? ` ${season.season_number}` : '';

  const formatStandingsText = () => {
    const title = `🔥 ${showName}${seasonNum}${league ? ` — ${league.name}` : ''} Scoreboard`;
    const divider = '─'.repeat(30);
    const lines = teams.map((t, i) => {
      const medal = i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
      const roster = t.players?.map(p => `  • ${p.name} (${Number(p.total_points).toFixed(1)})`).join('\n') || '';
      return `${medal} ${t.name} — ${t.total_score.toFixed(1)} pts\n   ${t.owner_name}\n${roster}`;
    });
    const url = window.location.origin + leagueBase;
    return `${title}\n${divider}\n${lines.join('\n\n')}\n\n${url}`;
  };

  return (
    <div className="scoreboard-page">
      <h1 className="page-title">SCOREBOARD</h1>

      <div className="tab-bar">
        <button className={`tab ${activeTab === 'standings' ? 'active' : ''}`} onClick={() => setActiveTab('standings')}>
          Standings
        </button>
        <button className={`tab ${activeTab === 'rules' ? 'active' : ''}`} onClick={() => setActiveTab('rules')}>
          Scoring Rules
        </button>
        <button className={`tab ${activeTab === 'log' ? 'active' : ''}`} onClick={() => setActiveTab('log')}>
          Score Log
        </button>
      </div>

      {activeTab === 'standings' && (
        <div className="standings">
          {teams.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <ShareButton getText={formatStandingsText} label="Share Standings" />
            </div>
          )}
          {teams.length === 0 ? (
            <div className="empty-state">No teams yet. The draft hasn't started!</div>
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
                    {team.players?.map(p => (
                      <PlayerCard key={p.id} player={p} compact showScore />
                    ))}
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
            <thead>
              <tr>
                <th>Event</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id} className={rule.points < 0 ? 'negative-row' : ''}>
                  <td>{rule.description}</td>
                  <td className={`points-cell ${rule.points < 0 ? 'negative' : 'positive'}`}>
                    {rule.is_variable ? 'Variable' : (rule.points > 0 ? '+' : '') + rule.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'log' && (
        <div className="score-log">
          {events.length === 0 ? (
            <div className="empty-state">No scoring events yet.</div>
          ) : (
            <table className="log-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Event</th>
                  <th>Points</th>
                  <th>Episode</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {events.map(event => (
                  <tr key={event.id}>
                    <td className="log-player">{event.player_name}</td>
                    <td>{event.event_type.replace(/_/g, ' ')}</td>
                    <td className={`points-cell ${event.points >= 0 ? 'positive' : 'negative'}`}>
                      {event.points > 0 ? '+' : ''}{event.points}
                    </td>
                    <td>{event.episode || '-'}</td>
                    <td>{new Date(event.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
