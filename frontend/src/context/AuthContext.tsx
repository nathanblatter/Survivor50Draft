import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../api';

interface AuthContextType {
  isAdmin: boolean;
  login: (password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  isAdmin: false,
  login: async () => {},
  logout: () => {},
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('fantasydraft_token');
    if (token) {
      api.verifyToken()
        .then(() => setIsAdmin(true))
        .catch(() => {
          localStorage.removeItem('fantasydraft_token');
          setIsAdmin(false);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (password: string) => {
    const { token } = await api.login(password);
    localStorage.setItem('fantasydraft_token', token);
    setIsAdmin(true);
  };

  const logout = () => {
    localStorage.removeItem('fantasydraft_token');
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ isAdmin, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
