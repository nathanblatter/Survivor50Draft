import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '../api';
import { Tribe } from '../types';

interface TribeContextType {
  tribes: Tribe[];
  activeTribes: Tribe[];
  getTribeColor: (name: string) => string;
  loading: boolean;
  refresh: () => void;
}

const DEFAULT_COLOR = '#D4A843';

const TribeContext = createContext<TribeContextType>({
  tribes: [],
  activeTribes: [],
  getTribeColor: () => DEFAULT_COLOR,
  loading: true,
  refresh: () => {},
});

/** Loads the tribes for a season. Pass seasonId explicitly (admin) or it is read from the league context. */
export function TribeProvider({ seasonId, children }: { seasonId: number | null | undefined; children: ReactNode }) {
  const [tribes, setTribes] = useState<Tribe[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTribes = useCallback(() => {
    if (!seasonId) { setTribes([]); setLoading(false); return; }
    setLoading(true);
    api.getSeasonTribes(seasonId)
      .then(setTribes)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [seasonId]);

  useEffect(() => { loadTribes(); }, [loadTribes]);

  const activeTribes = tribes.filter(t => t.is_active);
  const getTribeColor = useCallback((name: string): string => {
    return tribes.find(t => t.name === name)?.color || DEFAULT_COLOR;
  }, [tribes]);

  return (
    <TribeContext.Provider value={{ tribes, activeTribes, getTribeColor, loading, refresh: loadTribes }}>
      {children}
    </TribeContext.Provider>
  );
}

export const useTribes = () => useContext(TribeContext);
