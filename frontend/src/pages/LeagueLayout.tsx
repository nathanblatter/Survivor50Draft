import { Outlet, Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { TribeProvider } from '../context/TribeContext';

export default function LeagueLayout() {
  const { season, loading, error } = useAppContext();

  if (loading && !season) return <div className="loading">Loading league...</div>;
  if (error) {
    return (
      <div className="error-page">
        <h2>League not found</h2>
        <p className="text-muted">{error}</p>
        <Link to="/" className="btn btn-secondary" style={{ marginTop: '1rem' }}>Back to home</Link>
      </div>
    );
  }

  return (
    <TribeProvider seasonId={season?.id}>
      <Outlet />
    </TribeProvider>
  );
}
