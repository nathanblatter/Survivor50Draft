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

  useEffect(() => {
    if (!showSlug || !seasonNum) return;
    Promise.all([
      api.getShow(showSlug),
      api.getSeasonBySlug(showSlug, parseInt(seasonNum)),
    ])
      .then(async ([showData, seasonData]) => {
        setShow(showData);
        setSeason(seasonData);
        const leaguesData = await api.getLeagues(seasonData.id);
        setLeagues(leaguesData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [showSlug, seasonNum]);

  const handleCreateLeague = async () => {
    if (!season || !newLeagueName.trim()) return;
    setCreating(true);
    try {
      const data: { name: string; invite_code?: string } = { name: newLeagueName.trim() };
      if (newInviteCode.trim()) data.invite_code = newInviteCode.trim();
      const league = await api.createLeague(season.id, data);
      setLeagues(prev => [...prev, league]);
      setNewLeagueName('');
      setNewInviteCode('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (!show || !season) return <div className="error-page">Season not found</div>;

  return (
    <div className="season-page">
      <section className="hero">
        <div className="hero-content">
          <Link to={`/${showSlug}`} className="breadcrumb-link">&larr; {show.name}</Link>
          <h1 className="hero-title">{show.name.toUpperCase()} {season.season_number}</h1>
          {season.name && <p className="hero-subtitle">{season.name.toUpperCase()}</p>}
          <p className="hero-tagline">{season.cast_count} Players · Fantasy Draft League</p>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Leagues</h2>
        {leagues.length === 0 ? (
          <p className="empty-message">No leagues yet. Create one to get started!</p>
        ) : (
          <div className="leagues-grid">
            {leagues.map(league => (
              <div key={league.id} className="league-card-wrapper">
                <Link
                  to={`/${showSlug}/${seasonNum}/leagues/${league.invite_code}`}
                  className="league-card"
                >
                  <h3 className="league-card-name">{league.name}</h3>
                  <div className="league-card-meta">
                    {league.team_count || 0} team{(league.team_count || 0) !== 1 ? 's' : ''}
                  </div>
                  <div className="league-card-code">Code: {league.invite_code}</div>
                </Link>
                <button
                  className="league-copy-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    const url = `${window.location.origin}/${showSlug}/${seasonNum}/leagues/${league.invite_code}`;
                    navigator.clipboard.writeText(url);
                    const btn = e.currentTarget;
                    btn.textContent = '✓ Copied!';
                    setTimeout(() => { btn.textContent = '🔗 Copy Link'; }, 2000);
                  }}
                >
                  🔗 Copy Link
                </button>
              </div>
            ))}
          </div>
        )}

        {isAdmin && (
          <div className="create-league-form">
            <h3>Create New League</h3>
            <div className="form-row">
              <input
                type="text"
                placeholder="League name"
                value={newLeagueName}
                onChange={e => setNewLeagueName(e.target.value)}
                className="input"
              />
              <input
                type="text"
                placeholder="Invite code (optional)"
                value={newInviteCode}
                onChange={e => setNewInviteCode(e.target.value)}
                className="input"
              />
              <button
                onClick={handleCreateLeague}
                disabled={creating || !newLeagueName.trim()}
                className="btn btn-primary"
              >
                {creating ? 'Creating...' : 'Create League'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
