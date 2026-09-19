import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { Show, Season, League } from '../types';
import { useAuth } from '../context/AuthContext';

export default function SeasonPage() {
  const { showSlug, seasonNum } = useParams<{ showSlug: string; seasonNum: string }>();
  const { isAdmin } = useAuth();
  const [show, setShow] = useState<Show | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLeagueName, setNewLeagueName] = useState('');
  const [newInviteCode, setNewInviteCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    if (!showSlug || !seasonNum) return;
    Promise.all([api.getShow(showSlug), api.getSeasonBySlug(showSlug, parseInt(seasonNum))])
      .then(async ([showData, seasonData]) => {
        setShow(showData);
        setSeason(seasonData);
        setLeagues(await api.getLeagues(seasonData.id));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [showSlug, seasonNum]);

  const handleCreateLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!season || !newLeagueName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const data: { name: string; invite_code?: string } = { name: newLeagueName.trim() };
      if (newInviteCode.trim()) data.invite_code = newInviteCode.trim();
      const league = await api.createLeague(season.id, data);
      setLeagues(prev => [...prev, { ...league, team_count: 0 }]);
      setNewLeagueName('');
      setNewInviteCode('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const copyLink = (league: League) => {
    const url = `${window.location.origin}/${showSlug}/${seasonNum}/leagues/${league.invite_code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(league.id);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => {});
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (!show || !season) return <div className="error-page">Season not found</div>;

  return (
    <div className="season-page">
      <section className="hero">
        <div className="hero-content">
          <Link to={`/${showSlug}`} className="breadcrumb-link">&larr; All seasons</Link>
          <h1 className="hero-title">{show.name.toUpperCase()} {season.season_number}</h1>
          {season.name && <p className="hero-subtitle">{season.name.toUpperCase()}</p>}
          <p className="hero-tagline">
            {season.cast_count} castaways
            {season.is_complete ? ' · Season complete' : season.current_episode > 0 ? ` · Episode ${season.current_episode}` : season.premiere_date ? ` · Premieres ${new Date(season.premiere_date.slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}` : ''}
          </p>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Leagues</h2>
        <p className="section-intro">
          Every league drafts its own teams from the same cast and scores off the same episodes.
          Run one with friends and another with family. Share a league link to invite people.
        </p>
        {leagues.length === 0 ? (
          <p className="empty-message">No leagues yet{isAdmin ? ' — create one below.' : '. Ask the commissioner for an invite link.'}</p>
        ) : (
          <div className="leagues-grid">
            {leagues.map(league => (
              <div key={league.id} className="league-card-wrapper">
                <Link to={`/${showSlug}/${seasonNum}/leagues/${league.invite_code}`} className="league-card">
                  <h3 className="league-card-name">{league.name}</h3>
                  <div className="league-card-meta">
                    {league.team_count || 0} team{(league.team_count || 0) !== 1 ? 's' : ''}
                  </div>
                  <div className="league-card-code">/{league.invite_code}</div>
                </Link>
                <button className="league-copy-btn" onClick={() => copyLink(league)}>
                  {copied === league.id ? '✓ Copied!' : '🔗 Copy invite link'}
                </button>
              </div>
            ))}
          </div>
        )}

        {isAdmin && (
          <form className="create-league-form" onSubmit={handleCreateLeague}>
            <h3>Create a league</h3>
            <div className="form-row">
              <input
                type="text"
                placeholder="League name (e.g. Blatter Family League)"
                value={newLeagueName}
                onChange={e => setNewLeagueName(e.target.value)}
                className="form-input"
              />
              <input
                type="text"
                placeholder="Invite code (optional, e.g. family51)"
                value={newInviteCode}
                onChange={e => setNewInviteCode(e.target.value)}
                className="form-input"
              />
              <button type="submit" disabled={creating || !newLeagueName.trim()} className="btn btn-primary">
                {creating ? 'Creating...' : 'Create League'}
              </button>
            </div>
            {error && <div className="form-error">{error}</div>}
          </form>
        )}
      </section>
    </div>
  );
}
