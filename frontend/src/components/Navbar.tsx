import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';

export default function Navbar() {
  const { isAdmin, logout } = useAuth();
  const { show, season, league, leagueBase } = useAppContext();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCopied, setShowCopied] = useState(false);

  const inLeague = Boolean(show && season && league);
  const isActive = (path: string) => location.pathname === path ? 'nav-link active' : 'nav-link';

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const handleShareLink = () => {
    const url = window.location.origin + leagueBase;
    navigator.clipboard.writeText(url).then(() => {
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    }).catch(() => {});
  };

  const close = () => setMenuOpen(false);

  return (
    <>
      <nav className="navbar">
        <div className="navbar-inner">
          <Link to={inLeague ? leagueBase : '/'} className="nav-logo">
            <span className="logo-fire">🔥</span>
            <div className="logo-text-group">
              <span className="logo-text">
                {inLeague ? `${show!.name.toUpperCase()} ${season!.season_number}` : 'SURVIVOR'}
              </span>
              <span className="logo-sub">
                {inLeague ? league!.name : 'FANTASY DRAFT'}
              </span>
            </div>
          </Link>

          <button
            className={`hamburger ${menuOpen ? 'open' : ''}`}
            onClick={() => setMenuOpen(prev => !prev)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            <span /><span /><span />
          </button>

          <div className={`nav-links ${menuOpen ? 'open' : ''}`}>
            {inLeague ? (
              <>
                <Link to={leagueBase} className={isActive(leagueBase)} onClick={close}>Home</Link>
                <Link to={`${leagueBase}/cast`} className={isActive(`${leagueBase}/cast`)} onClick={close}>Cast</Link>
                <Link to={`${leagueBase}/draft`} className={isActive(`${leagueBase}/draft`)} onClick={close}>Draft</Link>
                <Link to={`${leagueBase}/scoreboard`} className={isActive(`${leagueBase}/scoreboard`)} onClick={close}>Scores</Link>
                <Link to={`${leagueBase}/gamestate`} className={isActive(`${leagueBase}/gamestate`)} onClick={close}>Game</Link>
                {season!.is_complete && (
                  <Link to={`${leagueBase}/recap`} className={isActive(`${leagueBase}/recap`)} onClick={close}>Recap</Link>
                )}
                <button onClick={() => { handleShareLink(); close(); }} className="nav-btn share-btn" title="Copy league link">
                  {showCopied ? '✓ Copied!' : '🔗 Invite'}
                </button>
              </>
            ) : (
              <>
                <Link to="/survivor" className={isActive('/survivor')} onClick={close}>Seasons</Link>
                <Link to="/hall-of-fame" className={isActive('/hall-of-fame')} onClick={close}>Hall of Fame</Link>
              </>
            )}
            {isAdmin && (
              <>
                <Link to="/admin" className={isActive('/admin')} onClick={close}>Admin</Link>
                <button onClick={() => { logout(); close(); }} className="nav-btn logout-btn">Logout</button>
              </>
            )}
          </div>
        </div>
      </nav>
      {menuOpen && <div className="menu-overlay" onClick={close} />}
    </>
  );
}
