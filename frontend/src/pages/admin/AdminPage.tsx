import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { TribeProvider } from '../../context/TribeContext';
import { AdminProvider, useAdmin } from './AdminContext';
import DashboardTab from './DashboardTab';
import EpisodeTab from './EpisodeTab';
import ScoresTab from './ScoresTab';
import CastTab from './CastTab';
import LeagueTab from './LeagueTab';
import GameStateTab from './GameStateTab';
import RecapTab from './RecapTab';
import SeasonsTab from './SeasonsTab';

type AdminTab = 'home' | 'episode' | 'scores' | 'cast' | 'league' | 'gamestate' | 'recap' | 'seasons';

const TABS: { id: AdminTab; icon: string; label: string; intro: string }[] = [
  { id: 'home', icon: '🏠', label: 'Home', intro: '' },
  { id: 'episode', icon: '📺', label: 'Log Episode', intro: '' },
  { id: 'scores', icon: '⚡', label: 'Scores', intro: 'One-off scores and corrections. Add a rare event to a few players, or delete a mistake from the log. The weekly flow lives in Log Episode.' },
  { id: 'cast', icon: '🌿', label: 'Cast & Tribes', intro: 'Who is playing and which tribe they are on. Rename tribes here when CBS reveals the real names; swaps and the merge live here too.' },
  { id: 'league', icon: '👥', label: 'Leagues', intro: 'Leagues are groups of people drafting from this cast. Each has its own invite link, teams and draft; all of them share the episode scoring.' },
  { id: 'gamestate', icon: '🗿', label: 'Game State', intro: 'Who is holding idols and advantages, and who is aligned. This feeds the recaps. Finding or playing an idol still needs a score in Log Episode.' },
  { id: 'recap', icon: '📜', label: 'Recaps', intro: 'AI-written recaps: a group-chat episode recap from the scoring, or a full-season story for one team.' },
  { id: 'seasons', icon: '⚙️', label: 'Seasons', intro: 'Create a new season, set the premiere date, and mark a season complete when it ends.' },
];

const VALID = new Set<string>(TABS.map(t => t.id));

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
  const [tab, setTab] = useState<AdminTab>(() => {
    const saved = localStorage.getItem('admin_tab');
    return saved && VALID.has(saved) ? (saved as AdminTab) : 'home';
  });
  useEffect(() => { localStorage.setItem('admin_tab', tab); }, [tab]);
  const goTo = (t: string) => { if (VALID.has(t)) { setTab(t as AdminTab); window.scrollTo({ top: 0, behavior: 'smooth' }); } };

  if (loading) return <div className="loading">Loading...</div>;
  const current = TABS.find(t => t.id === tab)!;

  return (
    <div className="admin-page">
      <div className="admin-header compact">
        <h1 className="admin-title">Commissioner</h1>
        <p className="admin-subtitle">{season ? `${season.show_name} ${season.season_number}` : 'No season selected'}</p>
      </div>

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
        <label className="admin-context-episode" title="The episode you are logging or reviewing">
          <span>Logging episode</span>
          <div className="stepper">
            <button type="button" onClick={() => setEpisode(Math.max(1, episode - 1))} aria-label="Previous episode">−</button>
            <input type="number" min={1} value={episode || ''} onChange={e => setEpisode(parseInt(e.target.value) || 1)} />
            <button type="button" onClick={() => setEpisode(episode + 1)} aria-label="Next episode">+</button>
          </div>
        </label>
        {season && league && (
          <Link className="admin-context-link" to={`/${season.show_slug}/${season.season_number}/leagues/${league.invite_code}`} target="_blank" rel="noreferrer">
            View league ↗
          </Link>
        )}
      </div>

      <div className="admin-command-rail" role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`cmd-btn ${tab === t.id ? 'active' : ''}`} onClick={() => goTo(t.id)}>
            <span className="cmd-icon">{t.icon}</span>
            <span className="cmd-label">{t.label}</span>
          </button>
        ))}
      </div>

      {message && <div className={`toast ${message.kind}`}>{message.text}</div>}

      {!season && tab !== 'seasons' ? (
        <div className="summary-empty"><p>Create a season first.</p><button className="btn btn-primary" onClick={() => goTo('seasons')}>Go to Seasons</button></div>
      ) : (
        <TribeProvider seasonId={season?.id}>
          {current.intro && <p className="tab-intro">{current.intro}</p>}
          {tab === 'home' && <DashboardTab goTo={goTo} />}
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
