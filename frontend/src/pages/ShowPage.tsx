import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { Show, Season } from '../types';

export default function ShowPage() {
  const { showSlug } = useParams<{ showSlug: string }>();
  const [show, setShow] = useState<Show | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!showSlug) return;
    Promise.all([
      api.getShow(showSlug),
      api.getSeasons(showSlug),
    ])
      .then(([showData, seasonsData]) => {
        setShow(showData);
        setSeasons(seasonsData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [showSlug]);

  if (loading) return <div className="loading">Loading...</div>;
  if (!show) return <div className="error-page">Show not found</div>;

  return (
    <div className="show-page">
      <section className="hero">
        <div className="hero-content">
          <Link to="/" className="breadcrumb-link">&larr; All Shows</Link>
          <h1 className="hero-title">{show.name.toUpperCase()}</h1>
          {show.description && <p className="hero-subtitle">{show.description}</p>}
          <p className="hero-tagline">Fantasy Draft League</p>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Seasons</h2>
        {seasons.length === 0 ? (
          <p className="empty-message">No seasons yet.</p>
        ) : (
          <div className="seasons-grid">
            {seasons.map(season => (
              <Link
                to={`/${showSlug}/${season.season_number}`}
                key={season.id}
                className="season-card"
              >
                <div className="season-card-number">Season {season.season_number}</div>
                {season.name && <div className="season-card-name">{season.name}</div>}
                <div className="season-card-meta">
                  {season.player_count || season.cast_count} players
                  {' · '}
                  {season.league_count || 0} league{(season.league_count || 0) !== 1 ? 's' : ''}
                </div>
                {season.is_active && <span className="badge badge-active">Active</span>}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
