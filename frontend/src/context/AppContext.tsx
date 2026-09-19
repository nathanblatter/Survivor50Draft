import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useMatch } from 'react-router-dom';
import { api } from '../api';
import { Show, Season, League } from '../types';

interface AppContextType {
  show: Show | null;
  season: Season | null;
  league: League | null;
  /** URL prefix for the current league, e.g. /survivor/51/leagues/og51 (empty outside a league). */
  leagueBase: string;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const AppContext = createContext<AppContextType>({
  show: null,
  season: null,
  league: null,
  leagueBase: '',
  loading: false,
  error: null,
  refresh: () => {},
});

/**
 * Resolves show / season / league from the URL for every page (including the navbar),
 * so league navigation works anywhere under /:show/:season/leagues/:code.
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const match = useMatch('/:showSlug/:seasonNum/leagues/:inviteCode/*');
  const showSlug = match?.params.showSlug;
  const seasonNum = match?.params.seasonNum;
  const inviteCode = match?.params.inviteCode;

  const [show, setShow] = useState<Show | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [league, setLeague] = useState<League | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!showSlug || !seasonNum || !inviteCode) {
      setShow(null); setSeason(null); setLeague(null); setError(null); setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api.getShow(showSlug),
      api.getSeasonBySlug(showSlug, parseInt(seasonNum)),
      api.getLeagueByInviteCode(inviteCode),
    ])
      .then(([showData, seasonData, leagueData]) => {
        if (cancelled) return;
        if (leagueData.season_id !== seasonData.id) throw new Error('That league belongs to a different season');
        setShow(showData);
        setSeason(seasonData);
        setLeague(leagueData);
      })
      .catch((err) => {
        if (cancelled) return;
        setShow(null); setSeason(null); setLeague(null);
        setError(err.message);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [showSlug, seasonNum, inviteCode, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const leagueBase = show && season && league ? `/${show.slug}/${season.season_number}/leagues/${league.invite_code}` : '';

  return (
    <AppContext.Provider value={{ show, season, league, leagueBase, loading, error, refresh }}>
      {children}
    </AppContext.Provider>
  );
}

export const useAppContext = () => useContext(AppContext);
