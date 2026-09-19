import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { TribeProvider } from '../../context/TribeContext';
import { AdminProvider, useAdmin } from './AdminContext';
import EpisodeTab from './EpisodeTab';
import ScoresTab from './ScoresTab';
import CastTab from './CastTab';
import LeagueTab from './LeagueTab';
import GameStateTab from './GameStateTab';
import RecapTab from './RecapTab';
import SeasonsTab from './SeasonsTab';

type AdminTab = 'episode' | 'scores' | 'cast' | 'league' | 'gamestate' | 'recap' | 'seasons';

const TABS: { id: AdminTab; icon: string; label: string }[] = [
  { id: 'episode', icon: '📺', label: 'Log Episode' },
  { id: 'scores', icon: '⚡', label: 'Scores' },
  { id: 'cast', icon: '🌿', label: 'Cast & Tribes' },
  { id: 'league', icon: '👥', label: 'Leagues' },
  { id: 'gamestate', icon: '🗺️', label: 'Game State' },
  { id: 'recap', icon: '📜', label: 'Recaps' },
  { id: 'seasons', icon: '⚙️', label: 'Seasons' },
];

export default function AdminPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate('/login');
  }, [isAdmin, authLoading, navigate]);

  if (authLoading) return <div className="loading">Loading...</div>;
  if (!isAdmin) return null;

  return (
    <AdminProvider>
      <AdminShell />
    </AdminProvider>
  );
}

function AdminShell() {
  const { seasons, leagues, season, league, episode, loading, selectSeason, selectLeague, setEpisode, message } = useAdmin();
  const [tab, setTab] = useState<AdminTab>(() => (localStorage.getItem('admin_tab') as AdminTab) || 'episode');
  useEffect(() => { localStorage.setItem('admin_tab', tab); }, [tab]);

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1 className="admin-title">TRIBAL COUNCIL</h1>
        <p className="admin-subtitle">Commissioner's war room</p>
      </div>

      {/* Working context — persists across tabs */}
      <div className="admin-context-bar">
        <label>
          <span>Season</span>
          <select className="form-select" value={season?.id || 0} onChange={e => selectSeason(parseInt(e.target.value))}>
            {seasons.length === 0 && <option value={0}>No seasons yet</option>}
            {seasons.map(s => (
              <option key={s.id} value={s.id}>
                {s.show_name} {s.season_number}{s.name ? ` · ${s.name}` : ''}{s.is_complete ? ' (done)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>League</span>
          <select className="form-select" value={league?.id || 0} onChange={e => selectLeague(parseInt(e.target.value))} disabled={leagues.length === 0}>
            {leagues.length === 0 && <option value={0}>No leagues</option>}
            {leagues.map(l => <option key={l.id} value={l.id}>{l.name} ({l.team_count || 0} teams)</option>)}
          </select>
        </label>
        <label className="admin-context-episode">
          <span>Episode</span>
          <div className="stepper">
            <button type="button" onClick={() => setEpisode(Math.max(1, episode - 1))} aria-label="Previous episode">−</button>
            <input type="number" min={1} value={episode || ''} onChange={e => setEpisode(parseInt(e.target.value) || 1)} />
            <button type="button" onClick={() => setEpisode(episode + 1)} aria-label="Next episode">+</button>
          </div>
        </label>
        {season && league && (
          <Link className="admin-context-link" to={`/${season.show_slug}/${season.season_number}/leagues/${league.invite_code}`} target="_blank" rel="noreferrer">
            View site ↗
          </Link>
        )}
      </div>

      <div className="admin-command-rail" role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`cmd-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <span className="cmd-icon">{t.icon}</span>
            <span className="cmd-label">{t.label}</span>
          </button>
        ))}
      </div>

      {message && <div className={`toast ${message.kind}`}>{message.text}</div>}

      {!season && tab !== 'seasons' ? (
        <div className="summary-empty"><p>Create a season first (Seasons tab).</p></div>
      ) : (
        <TribeProvider seasonId={season?.id}>
          {tab === 'episode' && <EpisodeTab />}
          {tab === 'scores' && <ScoresTab />}
          {tab === 'cast' && <CastTab />}
          {tab === 'league' && <LeagueTab />}
          {tab === 'gamestate' && <GameStateTab />}
          {tab === 'recap' && <RecapTab />}
          {tab === 'seasons' && <SeasonsTab />}
        </TribeProvider>
      )}
    </div>
  );
}
