import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Show } from '../types';

export default function LandingPage() {
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getShows()
      .then(setShows)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="landing-page">
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">FANTASY DRAFT</h1>
          <p className="hero-subtitle">Reality TV Fantasy Leagues</p>
          <p className="hero-tagline">Draft your favorite players and compete with friends</p>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Shows</h2>
        {shows.length === 0 ? (
          <p className="empty-message">No shows yet. Ask the admin to create one.</p>
        ) : (
          <div className="shows-grid">
            {shows.map(show => (
              <Link to={`/${show.slug}`} key={show.id} className="show-card">
                <h3 className="show-card-name">{show.name}</h3>
                {show.description && <p className="show-card-desc">{show.description}</p>}
                <span className="show-card-count">
                  {show.season_count || 0} season{(show.season_count || 0) !== 1 ? 's' : ''}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
