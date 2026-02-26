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

const TribeContext = createContext<TribeContextType>({
  tribes: [],
  activeTribes: [],
  getTribeColor: () => '#D4A843',
  loading: true,
  refresh: () => {},
});

export function TribeProvider({ children }: { children: ReactNode }) {
  const [tribes, setTribes] = useState<Tribe[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTribes = useCallback(() => {
    api.getTribes()
      .then(setTribes)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadTribes();
  }, [loadTribes]);

  const activeTribes = tribes.filter(t => t.is_active);

  const getTribeColor = useCallback((name: string): string => {
    const tribe = tribes.find(t => t.name === name);
    return tribe?.color || '#D4A843';
  }, [tribes]);

  return (
    <TribeContext.Provider value={{ tribes, activeTribes, getTribeColor, loading, refresh: loadTribes }}>
      {children}
    </TribeContext.Provider>
  );
}

export const useTribes = () => useContext(TribeContext);
