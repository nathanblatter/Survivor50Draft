import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';

export default function Navbar() {
  const { isAdmin, logout } = useAuth();
  const { show, season, league } = useAppContext();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCopied, setShowCopied] = useState(false);

  const inLeague = show && season && league;
  const leagueBase = inLeague
    ? `/${show.slug}/${season.season_number}/leagues/${league.invite_code}`
    : '';

  const isActive = (path: string) => location.pathname === path ? 'nav-link active' : 'nav-link';

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleShareLink = () => {
    const url = window.location.origin + leagueBase;
    navigator.clipboard.writeText(url).then(() => {
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    });
  };

  return (
    <>
      <nav className="navbar">
        <div className="navbar-inner">
          <Link to={inLeague ? leagueBase : '/'} className="nav-logo">
            <span className="logo-fire">🔥</span>
            <div className="logo-text-group">
              <span className="logo-text">
                {inLeague ? `${show.name.toUpperCase()} ${season.season_number}` : 'FANTASY DRAFT'}
              </span>
              <span className="logo-sub">
                {inLeague ? league.name : 'DRAFT LEAGUE'}
              </span>
            </div>
          </Link>

          <button
            className={`hamburger ${menuOpen ? 'open' : ''}`}
            onClick={() => setMenuOpen(prev => !prev)}
            aria-label="Toggle menu"
          >
            <span /><span /><span />
          </button>

          <div className={`nav-links ${menuOpen ? 'open' : ''}`}>
            {inLeague ? (
              <>
                <Link to={leagueBase} className={isActive(leagueBase)} onClick={() => setMenuOpen(false)}>Home</Link>
                <Link to={`${leagueBase}/cast`} className={isActive(`${leagueBase}/cast`)} onClick={() => setMenuOpen(false)}>Cast</Link>
                <Link to={`${leagueBase}/draft`} className={isActive(`${leagueBase}/draft`)} onClick={() => setMenuOpen(false)}>Draft</Link>
                <Link to={`${leagueBase}/scoreboard`} className={isActive(`${leagueBase}/scoreboard`)} onClick={() => setMenuOpen(false)}>Scores</Link>
                <Link to={`${leagueBase}/gamestate`} className={isActive(`${leagueBase}/gamestate`)} onClick={() => setMenuOpen(false)}>Game</Link>
                <button onClick={() => { handleShareLink(); setMenuOpen(false); }} className="nav-btn share-btn" title="Copy league link">
                  {showCopied ? '✓ Copied!' : '🔗 Invite'}
                </button>
              </>
            ) : (
              <Link to="/" className={isActive('/')} onClick={() => setMenuOpen(false)}>Shows</Link>
            )}
            {isAdmin && (
              <>
                <Link to="/admin" className={isActive('/admin')} onClick={() => setMenuOpen(false)}>Admin</Link>
                <button onClick={() => { logout(); setMenuOpen(false); }} className="nav-btn logout-btn">Logout</button>
              </>
            )}
          </div>
        </div>
      </nav>
      {menuOpen && <div className="menu-overlay" onClick={() => setMenuOpen(false)} />}
    </>
  );
}
