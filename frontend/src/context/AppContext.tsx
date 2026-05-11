import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { Show, Season, League } from '../types';

interface AppContextType {
  show: Show | null;
  season: Season | null;
  league: League | null;
  loading: boolean;
  error: string | null;
}

const AppContext = createContext<AppContextType>({
  show: null,
  season: null,
  league: null,
  loading: true,
  error: null,
});

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <AppContext.Provider value={{ show: null, season: null, league: null, loading: false, error: null }}>
      {children}
    </AppContext.Provider>
  );
}

// Used inside LeagueLayout to provide full context from URL params
export function LeagueContextProvider({ children }: { children: ReactNode }) {
  const { showSlug, seasonNum, inviteCode } = useParams<{
    showSlug: string;
    seasonNum: string;
    inviteCode: string;
  }>();
  const [show, setShow] = useState<Show | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [league, setLeague] = useState<League | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!showSlug || !seasonNum || !inviteCode) return;

    setLoading(true);
    setError(null);

    Promise.all([
      api.getShow(showSlug),
      api.getSeasonBySlug(showSlug, parseInt(seasonNum)),
      api.getLeagueByInviteCode(inviteCode),
    ])
      .then(([showData, seasonData, leagueData]) => {
        setShow(showData);
        setSeason(seasonData);
        setLeague(leagueData);
      })
      .catch((err) => {
        console.error('Failed to load context:', err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [showSlug, seasonNum, inviteCode]);

  return (
    <AppContext.Provider value={{ show, season, league, loading, error }}>
      {children}
    </AppContext.Provider>
  );
}

export const useAppContext = () => useContext(AppContext);
