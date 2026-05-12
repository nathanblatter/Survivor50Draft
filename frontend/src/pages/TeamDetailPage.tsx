import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import PlayerCard from '../components/PlayerCard';
import ShareButton from '../components/ShareButton';

interface TeamDetail {
  id: number;
  name: string;
  owner_name: string;
  players: any[];
  events: any[];
  total_score: number;
}

export default function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { show, season, league } = useAppContext();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const leagueBase = show && season && league
    ? `/${show.slug}/${season.season_number}/leagues/${league.invite_code}`
    : '';

  useEffect(() => {
    if (id) {
      api.getTeam(parseInt(id))
        .then(setTeam)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [id]);

  if (loading) return <div className="loading">Loading...</div>;
  if (!team) return <div className="error-state">Team not found</div>;

  const showName = show ? show.name.toUpperCase() : '';
  const seasonNum = season ? ` ${season.season_number}` : '';

  const formatTeamText = () => {
    const title = `🔥 ${team.name} — ${team.total_score.toFixed(1)} pts`;
    const subtitle = `Manager: ${team.owner_name}`;
    const roster = team.players.map(p =>
      `• ${p.name} (${p.tribe}) — ${Number(p.total_points).toFixed(1)} pts${p.is_eliminated ? ' [OUT]' : ''}`
    ).join('\n');
    const url = window.location.origin + leagueBase + `/team/${team.id}`;
    return `${title}\n${subtitle}\n${showName}${seasonNum}${league ? ` — ${league.name}` : ''}\n\nRoster:\n${roster}\n\n${url}`;
  };

  return (
    <div className="team-detail-page">
      <Link to={`${leagueBase}/scoreboard`} className="back-link">&larr; Back to Scoreboard</Link>

      <div className="team-detail-header">
        <h1 className="page-title">{team.name}</h1>
        <p className="team-owner-name">Manager: {team.owner_name}</p>
        <div className="team-total-score">
          <span className="big-score">{team.total_score.toFixed(1)}</span>
          <span className="score-label">Total Points</span>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <ShareButton getText={formatTeamText} label="Share Team" />
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">Roster</h2>
        <div className="cast-grid">
          {team.players.map((player: any) => (
            <PlayerCard key={player.id} player={player} showScore />
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Scoring History</h2>
        {team.events.length === 0 ? (
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
              {team.events.map((event: any) => (
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
      </section>
    </div>
  );
}
