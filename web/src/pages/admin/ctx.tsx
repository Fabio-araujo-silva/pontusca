// Estado compartilhado do painel: torneio selecionado + catálogos (torneios,
// atléticas, modalidades, equipe) carregados uma vez e invalidados nas mutações.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import type { InstitutionDTO, MatchSummary, Role, SportDTO, TournamentDTO } from '@shared/types';
import { get } from '@/lib/api';
import { useRooms, useSocketEvent } from '@/lib/socket';

export type AdminTournament = TournamentDTO & { matches: number };
export type AdminInstitution = InstitutionDTO & { athletes: number; matches: number };
export type AdminSport = SportDTO & { matches: number };
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string | null;
  active: boolean;
  sportIds: string[];
  matches: number;
  backupMatches: number;
}
export interface AdminMatchRow {
  summary: MatchSummary;
  mesario: { id: string; name: string; phone?: string | null } | null;
  backup: { id: string; name: string; phone?: string | null } | null;
  backupEnabled: boolean;
  countsForStandings?: boolean;
  notes?: string | null;
}

interface Ctx {
  tournaments: AdminTournament[];
  institutions: AdminInstitution[];
  sports: AdminSport[];
  users: AdminUser[];
  tournamentId: string | null;
  tournament: AdminTournament | null;
  setTournamentId(id: string): void;
  inst(id?: string | null): AdminInstitution | undefined;
  sport(id?: string | null): AdminSport | undefined;
  loading: boolean;
  refresh(...keys: ('tournaments' | 'institutions' | 'sports' | 'users')[]): void;
}

const AdminCtx = createContext<Ctx>(null as any);
const KEY = 'arq.admin.tournament';

export function AdminProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const tq = useQuery({ queryKey: ['admin', 'tournaments'], queryFn: () => get<AdminTournament[]>('/admin/tournaments?sandbox=all') });
  const iq = useQuery({ queryKey: ['admin', 'institutions'], queryFn: () => get<AdminInstitution[]>('/admin/institutions') });
  const sq = useQuery({ queryKey: ['admin', 'sports'], queryFn: () => get<AdminSport[]>('/admin/sports') });
  const uq = useQuery({ queryKey: ['admin', 'users'], queryFn: () => get<AdminUser[]>('/admin/users') });
  // outro admin mexeu no catálogo (atléticas, modalidades, torneios): atualiza aqui também
  useRooms(['mesa']); // sala leve: só escala e catálogo
  useSocketEvent('catalog:changed', () => {
    for (const k of ['tournaments', 'institutions', 'sports']) void qc.invalidateQueries({ queryKey: ['admin', k] });
  });
  const [tournamentId, setTid] = useState<string | null>(() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  });

  const tournaments = tq.data ?? [];
  // se o salvo sumiu (torneio apagado / sandbox limpo), cai no primeiro não-sandbox
  useEffect(() => {
    if (!tournaments.length || tq.isFetching) return; // espera a lista nova (ex.: sandbox recém-gerado)
    if (!tournamentId || !tournaments.some((t) => t.id === tournamentId)) {
      setTid((tournaments.find((t) => !t.isSandbox && t.active) ?? tournaments[0]).id);
    }
  }, [tournaments, tournamentId, tq.isFetching]);

  const value = useMemo<Ctx>(() => {
    const instMap = new Map((iq.data ?? []).map((i) => [i.id, i]));
    const sportMap = new Map((sq.data ?? []).map((s) => [s.id, s]));
    return {
      tournaments,
      institutions: iq.data ?? [],
      sports: sq.data ?? [],
      users: uq.data ?? [],
      tournamentId,
      tournament: tournaments.find((t) => t.id === tournamentId) ?? null,
      setTournamentId: (id) => {
        setTid(id);
        try {
          localStorage.setItem(KEY, id);
        } catch {
          /* ignore */
        }
      },
      inst: (id) => (id ? instMap.get(id) : undefined),
      sport: (id) => (id ? sportMap.get(id) : undefined),
      loading: tq.isLoading || iq.isLoading || sq.isLoading,
      refresh: (...keys) => {
        for (const k of keys.length ? keys : (['tournaments', 'institutions', 'sports', 'users'] as const)) qc.invalidateQueries({ queryKey: ['admin', k] });
      },
    };
  }, [tournaments, iq.data, sq.data, uq.data, tournamentId, tq.isLoading, iq.isLoading, sq.isLoading, qc]);

  return <AdminCtx.Provider value={value}>{children}</AdminCtx.Provider>;
}

export const useAdmin = () => useContext(AdminCtx);
