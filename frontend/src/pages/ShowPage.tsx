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
    Promise.all([api.getShow(showSlug), api.getSeasons(showSlug)])
      .then(([showData, seasonsData]) => {
        setShow(showData);
        setSeasons(seasonsData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [showSlug]);

  if (loading) return <div className="loading">Loading...</div>;
  if (!show) return <div className="error-page">Show not found</div>;

  const current = seasons.filter(s => s.is_active && !s.is_complete);
  const past = seasons.filter(s => s.is_complete || !s.is_active);

  const SeasonCard = ({ season }: { season: Season }) => (
    <Link to={`/${showSlug}/${season.season_number}`} className={`season-card ${season.is_complete ? 'complete' : ''}`}>
      <div className="season-card-number">Season {season.season_number}</div>
      {season.name && <div className="season-card-name">{season.name}</div>}
      <div className="season-card-meta">
        {season.player_count || season.cast_count} castaways
        {' · '}
        {season.league_count || 0} league{(season.league_count || 0) !== 1 ? 's' : ''}
      </div>
      {season.is_complete
        ? <span className="badge badge-complete">Finished</span>
        : season.is_active && <span className="badge badge-active">{season.current_episode > 0 ? `Episode ${season.current_episode}` : 'Pre-season'}</span>}
    </Link>
  );

  return (
    <div className="show-page">
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">{show.name.toUpperCase()}</h1>
          {show.description && <p className="hero-subtitle">{show.description}</p>}
          <p className="hero-tagline">Fantasy Draft League</p>
        </div>
      </section>

      {current.length > 0 && (
        <section className="section">
          <h2 className="section-title">Now Playing</h2>
          <div className="seasons-grid">{current.map(s => <SeasonCard key={s.id} season={s} />)}</div>
        </section>
      )}
      {past.length > 0 && (
        <section className="section">
          <h2 className="section-title">Past Seasons</h2>
          <div className="seasons-grid">{past.map(s => <SeasonCard key={s.id} season={s} />)}</div>
        </section>
      )}
      {seasons.length === 0 && <p className="empty-message">No seasons yet.</p>}
    </div>
  );
}
