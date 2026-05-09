import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi } from '../lib/api';

interface AuthState {
  isAuthenticated: boolean;
  isSetup: boolean;
  isLoading: boolean;
  userId: number | null;
  language: string;
  theme: string;
}

interface AuthContextType extends AuthState {
  login: (token: string, userId: number, language: string, theme: string) => void;
  logout: () => void;
  setLanguage: (lang: string) => void;
  setTheme: (theme: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isSetup: false,
    isLoading: true,
    userId: null,
    language: 'english',
    theme: 'dark',
  });

  useEffect(() => {
    async function init() {
      try {
        const token = localStorage.getItem('session_token');
        const { isSetup } = await authApi.status();

        if (token && isSetup) {
          // Verify existing token
          try {
            const data = await authApi.me();
            const user = data.user as { id: number; language: string; theme: string };
            setState({
              isAuthenticated: true,
              isSetup: true,
              isLoading: false,
              userId: user.id,
              language: user.language || 'english',
              theme: user.theme || 'dark',
            });
            return;
          } catch {
            localStorage.removeItem('session_token');
          }
        }

        setState(prev => ({ ...prev, isSetup, isLoading: false }));
      } catch {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    }
    init();
  }, []);

  function login(token: string, userId: number, language: string, theme: string) {
    localStorage.setItem('session_token', token);
    setState({
      isAuthenticated: true,
      isSetup: true,
      isLoading: false,
      userId,
      language,
      theme,
    });
  }

  function logout() {
    localStorage.removeItem('session_token');
    authApi.logout().catch(() => {});
    setState(prev => ({ ...prev, isAuthenticated: false, userId: null }));
  }

  function setLanguage(language: string) {
    setState(prev => ({ ...prev, language }));
  }

  function setTheme(theme: string) {
    setState(prev => ({ ...prev, theme }));
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout, setLanguage, setTheme }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
