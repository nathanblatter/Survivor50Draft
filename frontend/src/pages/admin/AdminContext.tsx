import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '../../api';
import { Show, Season, League, Player, ScoringRule, Tribe } from '../../types';

/**
 * One shared context for the whole admin panel: which season and league we're working in,
 * which episode we're logging, and the season's players / tribes / rules. Every tab reads
 * from here instead of asking for show → season → league again.
 */
interface AdminContextType {
  shows: Show[];
  seasons: Season[];
  leagues: League[];
  show: Show | null;
  season: Season | null;
  league: League | null;
  episode: number;
  players: Player[];
  activePlayers: Player[];
  tribes: Tribe[];
  rules: ScoringRule[];
  loading: boolean;
  selectSeason: (seasonId: number) => void;
  selectLeague: (leagueId: number) => void;
  setEpisode: (ep: number) => void;
  refresh: () => Promise<void>;
  refreshCatalog: () => Promise<void>;
  flash: (text: string, kind?: 'success' | 'error') => void;
  message: { text: string; kind: 'success' | 'error' } | null;
}

const AdminContext = createContext<AdminContextType | null>(null);

const SEASON_KEY = 'admin_season_id';
const LEAGUE_KEY = 'admin_league_id';
const EPISODE_KEY = 'admin_episode';

export function AdminProvider({ children }: { children: ReactNode }) {
  const [shows, setShows] = useState<Show[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [seasonId, setSeasonId] = useState<number>(() => parseInt(localStorage.getItem(SEASON_KEY) || '0') || 0);
  const [leagueId, setLeagueId] = useState<number>(() => parseInt(localStorage.getItem(LEAGUE_KEY) || '0') || 0);
  const [episode, setEpisodeState] = useState<number>(() => parseInt(localStorage.getItem(EPISODE_KEY) || '0') || 0);
  const [players, setPlayers] = useState<Player[]>([]);
  const [tribes, setTribes] = useState<Tribe[]>([]);
  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<AdminContextType['message']>(null);

  const flash = useCallback((text: string, kind: 'success' | 'error' = 'success') => {
    setMessage({ text, kind });
    setTimeout(() => setMessage(null), kind === 'error' ? 6000 : 3500);
  }, []);

  // Load every show's seasons once (small lists).
  const refreshCatalog = useCallback(async () => {
    const showList = await api.getShows();
    setShows(showList);
    const all = (await Promise.all(showList.map(s => api.getSeasons(s.slug)))).flat();
    all.sort((a, b) => b.season_number - a.season_number);
    setSeasons(all);
    // Default to the newest active, incomplete season.
    setSeasonId(prev => {
      if (prev && all.some(s => s.id === prev)) return prev;
      const active = all.find(s => s.is_active && !s.is_complete) || all[0];
      return active?.id || 0;
    });
  }, []);

  useEffect(() => { refreshCatalog().catch(console.error).finally(() => setLoading(false)); }, [refreshCatalog]);

  const season = seasons.find(s => s.id === seasonId) || null;
  const show = shows.find(s => s.id === season?.show_id) || null;

  const refresh = useCallback(async () => {
    if (!season || !show) { setPlayers([]); setTribes([]); setRules([]); setLeagues([]); return; }
    const [p, t, r, l] = await Promise.all([
      api.getSeasonPlayers(season.id),
      api.getSeasonTribes(season.id),
      api.getShowScoringRules(show.slug),
      api.getLeagues(season.id),
    ]);
    setPlayers(p);
    setTribes(t);
    setRules(r);
    setLeagues(l);
    setLeagueId(prev => (prev && l.some(x => x.id === prev)) ? prev : (l[0]?.id || 0));
  }, [season?.id, show?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { refresh().catch(console.error); }, [refresh]);

  // Default the episode to the season's current episode + 1 the first time a season is chosen.
  useEffect(() => {
    if (season && episode === 0) setEpisodeState((season.current_episode || 0) + 1);
  }, [season, episode]);

  useEffect(() => { if (seasonId) localStorage.setItem(SEASON_KEY, String(seasonId)); }, [seasonId]);
  useEffect(() => { if (leagueId) localStorage.setItem(LEAGUE_KEY, String(leagueId)); }, [leagueId]);
  useEffect(() => { if (episode) localStorage.setItem(EPISODE_KEY, String(episode)); }, [episode]);

  const selectSeason = (id: number) => { setSeasonId(id); setEpisodeState(0); };
  const league = leagues.find(l => l.id === leagueId) || null;

  return (
    <AdminContext.Provider value={{
      shows, seasons, leagues, show, season, league, episode,
      players, activePlayers: players.filter(p => !p.is_eliminated), tribes, rules, loading,
      selectSeason, selectLeague: setLeagueId, setEpisode: setEpisodeState,
      refresh, refreshCatalog, flash, message,
    }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin(): AdminContextType {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside AdminProvider');
  return ctx;
}
