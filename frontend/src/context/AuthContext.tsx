import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, TOKEN_KEY } from '../api';

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
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      api.verifyToken()
        .then(() => setIsAdmin(true))
        .catch(() => {
          localStorage.removeItem(TOKEN_KEY);
          setIsAdmin(false);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (password: string) => {
    const { token } = await api.login(password);
    localStorage.setItem(TOKEN_KEY, token);
    setIsAdmin(true);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ isAdmin, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
