import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Featured, HallOfFameEntry } from '../types';

/**
 * Landing: send people straight to the current season's league when there is exactly one,
 * otherwise show the season picker plus the Hall of Fame.
 */
export default function LandingPage() {
  const navigate = useNavigate();
  const [featured, setFeatured] = useState<Featured | null | undefined>(undefined);
  const [leagueCount, setLeagueCount] = useState<number | null>(null);
  const [hall, setHall] = useState<HallOfFameEntry[]>([]);

  useEffect(() => {
    api.getFeatured().then(async (f) => {
      setFeatured(f);
      if (f) {
        const leagues = await api.getLeagues(f.season_id).catch(() => []);
        setLeagueCount(leagues.length);
        if (leagues.length === 1) {
          navigate(`/${f.show_slug}/${f.season_number}/leagues/${leagues[0].invite_code}`, { replace: true });
        }
      }
    }).catch(() => setFeatured(null));
    api.getHallOfFame().then(setHall).catch(() => {});
  }, [navigate]);

  if (featured === undefined || (featured && leagueCount === null)) return <div className="loading">Loading...</div>;

  return (
    <div className="landing-page">
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">{featured ? `${featured.show_name.toUpperCase()} ${featured.season_number}` : 'SURVIVOR'}</h1>
          <p className="hero-subtitle">{featured?.season_name ? featured.season_name.toUpperCase() : 'FANTASY DRAFT LEAGUE'}</p>
          <p className="hero-tagline">Draft your castaways. Outscore your friends. Never hear the end of it.</p>
          {featured && (
            <div className="hero-actions">
              <Link to={`/${featured.show_slug}/${featured.season_number}`} className="btn btn-primary">
                {leagueCount ? 'Pick your league' : 'View season'}
              </Link>
            </div>
          )}
        </div>
      </section>

      {hall.length > 0 && (
        <section className="section">
          <div className="section-header">
            <h2 className="section-title">Hall of Fame</h2>
            <Link to="/hall-of-fame" className="view-all-link">All champions &rarr;</Link>
          </div>
          <div className="hof-strip">
            {hall.slice(0, 3).map((h) => (
              <Link key={h.league_id} to={`/${h.show_slug}/${h.season_number}/leagues/${h.invite_code}/recap`} className="hof-card">
                <div className="hof-card-season">{h.show_name} {h.season_number}{h.league_name !== 'Original League' ? ` · ${h.league_name}` : ''}</div>
                <div className="hof-card-crown">👑</div>
                <div className="hof-card-team">{h.champion.name}</div>
                <div className="hof-card-owner">{h.champion.owner_name}</div>
                <div className="hof-card-score">{h.champion.total_score.toFixed(1)} pts</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!featured && (
        <section className="section">
          <p className="empty-message">No active season right now. <Link to="/survivor">Browse past seasons</Link>.</p>
        </section>
      )}
    </div>
  );
}
