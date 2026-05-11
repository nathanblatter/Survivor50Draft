import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';

export default function Navbar() {
  const { isAdmin, logout } = useAuth();
  const { show, season, league } = useAppContext();
  const location = useLocation();

  // Determine if we're inside a league context
  const inLeague = show && season && league;
  const leagueBase = inLeague
    ? `/${show.slug}/${season.season_number}/leagues/${league.invite_code}`
    : '';

  const isActive = (path: string) => location.pathname === path ? 'nav-link active' : 'nav-link';

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to={inLeague ? leagueBase : '/'} className="nav-logo">
          <span className="logo-fire">🔥</span>
          <span className="logo-text">
            {inLeague ? `${show.name.toUpperCase()} ${season.season_number}` : 'FANTASY DRAFT'}
          </span>
          <span className="logo-sub">
            {inLeague ? league.name : 'DRAFT LEAGUE'}
          </span>
        </Link>
        <div className="nav-links">
          {inLeague ? (
            <>
              <Link to={leagueBase} className={isActive(leagueBase)}>Home</Link>
              <Link to={`${leagueBase}/cast`} className={isActive(`${leagueBase}/cast`)}>Cast</Link>
              <Link to={`${leagueBase}/draft`} className={isActive(`${leagueBase}/draft`)}>Draft</Link>
              <Link to={`${leagueBase}/scoreboard`} className={isActive(`${leagueBase}/scoreboard`)}>Scoreboard</Link>
              <Link to={`${leagueBase}/gamestate`} className={isActive(`${leagueBase}/gamestate`)}>Game State</Link>
            </>
          ) : (
            <Link to="/" className={isActive('/')}>Shows</Link>
          )}
          {isAdmin ? (
            <>
              <Link to="/admin" className={isActive('/admin')}>Admin</Link>
              <button onClick={logout} className="nav-btn logout-btn">Logout</button>
            </>
          ) : (
            <Link to="/login" className={isActive('/login')}>Admin Login</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
