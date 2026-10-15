import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import type { Role } from '@shared/types';
import { api, ApiError, tokenStore } from './api';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  sportIds: string[];
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login(email: string, password: string): Promise<User>;
  logout(): void;
}

const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!tokenStore.get());

  useEffect(() => {
    if (!tokenStore.get()) return;
    let timer: ReturnType<typeof setTimeout>;
    // sem sinal / servidor reiniciando não desloga: só 401 apaga a sessão
    const check = (attempt = 0) =>
      api<User>('/auth/me')
        .then((u) => {
          setUser(u);
          setLoading(false);
        })
        .catch((e) => {
          if (e instanceof ApiError && e.status === 401) {
            tokenStore.set(null);
            setLoading(false);
          } else timer = setTimeout(() => check(attempt + 1), Math.min(10_000, 1000 * 2 ** attempt));
        });
    void check();
    const onUnauth = () => {
      tokenStore.set(null);
      setUser(null);
    };
    window.addEventListener('arq:unauthorized', onUnauth);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('arq:unauthorized', onUnauth);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ token: string; user: User }>('/auth/login', { body: { email, password } });
    tokenStore.set(r.token);
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

/** Caminho escondido do painel admin (configurável no build). */
export const ADMIN_PATH = `/${(import.meta.env.VITE_ADMIN_PATH || 'bastidores').replace(/^\/+/, '')}`;
