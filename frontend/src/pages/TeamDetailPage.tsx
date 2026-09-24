import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, eventLabel, formatPoints } from '../api';
import { TeamDetail, ScoringRule } from '../types';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import PlayerCard from '../components/PlayerCard';
import ShareButton from '../components/ShareButton';

export default function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { show, season, league, leagueBase } = useAppContext();
  const { isAdmin } = useAuth();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api.getTeam(parseInt(id)).then(setTeam).catch(console.error).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => {
    if (show) api.getShowScoringRules(show.slug).then(setRules).catch(() => {});
  }, [show]);

  if (loading) return <div className="loading">Loading...</div>;
  if (!team || !league || !season) return <div className="error-state">Team not found</div>;
  if (team.league_id !== league.id) return <div className="error-state">That team is in a different league.</div>;

  const formatTeamText = () => {
    const roster = team.players.map(p =>
      `• ${p.name} (${p.tribe}) — ${Number(p.total_points).toFixed(1)} pts${p.placement === 1 ? ' 👑' : p.is_eliminated ? ' [OUT]' : ''}`
    ).join('\n');
    return `🔥 ${team.name} — ${team.total_score.toFixed(1)} pts\nManager: ${team.owner_name}\n${show?.name.toUpperCase()} ${season.season_number} — ${league.name}\n\nRoster:\n${roster}\n\n${window.location.origin + leagueBase}/team/${team.id}`;
  };

  const generateRecap = async () => {
    setGenerating(true);
    setError('');
    try {
      const r = await api.generateTeamSeasonRecap(league.id, team.id);
      setTeam({ ...team, recap: r.recap });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
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
          {team.players.map(player => <PlayerCard key={player.id} player={player} showScore badge={player.pick_number ? `Pick #${player.pick_number}` : undefined} />)}
        </div>
      </section>

      {(team.recap || (isAdmin && season.is_complete)) && (
        <section className="section">
          <div className="section-header">
            <h2 className="section-title">Season Recap</h2>
            {isAdmin && (
              <button className="btn btn-secondary btn-small" onClick={generateRecap} disabled={generating}>
                {generating ? 'Writing...' : team.recap ? 'Regenerate' : 'Generate recap'}
              </button>
            )}
          </div>
          {error && <div className="form-error">{error}</div>}
          {team.recap
            ? <div className="summary-output recap-prose">{team.recap}</div>
            : <div className="empty-state">No recap written yet.</div>}
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Scoring History</h2>
        {team.events.length === 0 ? (
          <div className="empty-state">No scoring events yet.</div>
        ) : (
          <div className="rules-table-container">
            <table className="log-table">
              <thead><tr><th>Ep</th><th>Player</th><th>Event</th><th>Points</th></tr></thead>
              <tbody>
                {team.events.map(event => (
                  <tr key={event.id}>
                    <td>{event.episode ?? '—'}</td>
                    <td className="log-player">{event.player_name}</td>
                    <td>{eventLabel(event.event_type, rules)}{event.notes ? <span className="log-note"> — {event.notes}</span> : null}</td>
                    <td className={`points-cell ${event.points >= 0 ? 'positive' : 'negative'}`}>{formatPoints(event.points)}{event.is_neutral && <span className="neutral-badge" title="Aired before the draft — recorded, not scored">pre-draft</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
