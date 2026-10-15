// Dados públicos: catálogo (torneios, atléticas, modalidades) + sincronização
// ao vivo do feed via WebSocket.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Highlight, InstitutionDTO, MatchSummary, SportDTO, TournamentDTO } from '@shared/types';
import { get } from './api';
import { SANDBOX } from './sandbox';
import { useRooms, useSocketEvent } from './socket';

export interface Bootstrap {
  tournaments: TournamentDTO[];
  institutions: InstitutionDTO[];
  sports: SportDTO[];
  sandbox: boolean;
}

export function useBootstrap() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['bootstrap', SANDBOX],
    queryFn: () => get<Bootstrap>(`/public/bootstrap?sandbox=${SANDBOX ? 1 : 0}`),
    staleTime: 60_000,
  });
  useSocketEvent('catalog:changed', () => qc.invalidateQueries({ queryKey: ['bootstrap'] }));
  const maps = useMemo(() => {
    const inst = new Map((q.data?.institutions ?? []).map((i) => [i.id, i]));
    const sport = new Map((q.data?.sports ?? []).map((s) => [s.id, s]));
    return { inst, sport };
  }, [q.data]);
  return { ...q, ...maps };
}

export const FALLBACK_INST: InstitutionDTO = {
  id: '?',
  name: '?',
  slug: '?',
  primaryColor: '#3a3d47',
  secondaryColor: '#8e8e93',
  flagPattern: 'solid',
};

// ---------------------------------------------------------------- destaques ao vivo

export interface LiveHighlight {
  summary: MatchSummary;
  highlight: Highlight;
}

const bus = new EventTarget();

export function onHighlight(fn: (h: LiveHighlight) => void) {
  const l = (e: Event) => fn((e as CustomEvent<LiveHighlight>).detail);
  bus.addEventListener('hl', l);
  return () => bus.removeEventListener('hl', l);
}

/**
 * Montado uma vez na raiz pública: entra na sala do feed e remenda o cache do
 * react-query a cada placar novo — o card muda na frente do torcedor sem refetch.
 */
export function useLiveSync() {
  const qc = useQueryClient();
  useRooms([SANDBOX ? 'feed:sandbox' : 'feed']);
  useSocketEvent<{ summary: MatchSummary; highlight: Highlight | null }>('summary', ({ summary, highlight }) => {
    qc.setQueryData<MatchSummary[]>(['feed', summary.tournamentId], (list) => {
      if (!list) return list;
      const i = list.findIndex((m) => m.id === summary.id);
      if (i < 0) return [...list, summary];
      if (list[i].updatedAt > summary.updatedAt) return list;
      const next = list.slice();
      next[i] = summary;
      return next;
    });
    qc.invalidateQueries({ queryKey: ['match', summary.id] });
    qc.invalidateQueries({ queryKey: ['standings', summary.tournamentId] });
    if (highlight) bus.dispatchEvent(new CustomEvent('hl', { detail: { summary, highlight } }));
  });
  useSocketEvent<{ tournamentId: string }>('feed:changed', ({ tournamentId }) => {
    qc.invalidateQueries({ queryKey: ['feed', tournamentId] });
  });
  useSocketEvent<{ tournamentId: string }>('standings:changed', ({ tournamentId }) => {
    qc.invalidateQueries({ queryKey: ['standings', tournamentId] });
  });
}

export function useFeed(tournamentId?: string) {
  return useQuery({
    queryKey: ['feed', tournamentId],
    queryFn: () => get<MatchSummary[]>(`/public/tournaments/${tournamentId}/feed`),
    enabled: !!tournamentId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
