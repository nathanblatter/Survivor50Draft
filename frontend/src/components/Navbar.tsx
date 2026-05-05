import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { isAdmin, logout } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path ? 'nav-link active' : 'nav-link';

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="nav-logo">
          <span className="logo-fire">🔥</span>
          <span className="logo-text">SURVIVOR 50</span>
          <span className="logo-sub">DRAFT LEAGUE</span>
        </Link>
        <div className="nav-links">
          <Link to="/" className={isActive('/')}>Home</Link>
          <Link to="/cast" className={isActive('/cast')}>Cast</Link>
          <Link to="/draft" className={isActive('/draft')}>Draft</Link>
          <Link to="/scoreboard" className={isActive('/scoreboard')}>Scoreboard</Link>
          <Link to="/gamestate" className={isActive('/gamestate')}>Game State</Link>
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
