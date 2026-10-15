// Dados públicos: catálogo (torneios, atléticas, modalidades) + sincronização
// ao vivo do feed via WebSocket.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Highlight, InstitutionDTO, MatchSummary, SportDTO, TournamentDTO } from '@shared/types';
import { get } from './api';
import { SANDBOX } from './sandbox';
import { useOnReconnect, useRooms, useSocketEvent } from './socket';

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
/** Executa depois de um atraso aleatório até `spread` ms (evita estouro de requisições simultâneas). */
function later(fn: () => void, spread: number) {
  setTimeout(fn, Math.random() * spread);
}

export function useLiveSync() {
  const qc = useQueryClient();
  useRooms([SANDBOX ? 'feed:sandbox' : 'feed']);
  // `tick` = só os campos que mudam num lance; o resto o card já tem do feed
  useSocketEvent<{ t: Partial<MatchSummary> & Pick<MatchSummary, 'id' | 'tournamentId' | 'updatedAt' | 'status' | 'manual'>; h: Highlight | null }>('tick', ({ t, h: highlight }) => {
    let before: MatchSummary | undefined;
    let summary: MatchSummary | undefined;
    qc.setQueryData<MatchSummary[]>(['feed', t.tournamentId], (list) => {
      if (!list) return list;
      const i = list.findIndex((m) => m.id === t.id);
      if (i < 0) return list; // jogo novo: vem completo no refetch abaixo
      before = list[i];
      if (list[i].updatedAt > t.updatedAt) return list;
      const next = list.slice();
      next[i] = summary = { ...list[i], ...t, live: { ...list[i].live, ...t.live } };
      return next;
    });
    if (!before) {
      later(() => qc.invalidateQueries({ queryKey: ['feed', t.tournamentId] }, { cancelRefetch: false }), 1500);
      return;
    }
    if (!summary) return;
    const m: MatchSummary = summary;
    // lance a lance: só quem está com o jogo aberto busca (query ativa); espalhado
    // no tempo pra milhares de torcedores não baterem no servidor no mesmo ms
    later(() => qc.invalidateQueries({ queryKey: ['match', m.id] }, { cancelRefetch: false }), 600);
    // classificação só muda quando um jogo termina (ou deixa de estar terminado)
    if (m.status === 'FINISHED' || before?.status === 'FINISHED' || m.manual !== before?.manual)
      later(() => qc.invalidateQueries({ queryKey: ['standings', m.tournamentId] }, { cancelRefetch: false }), 1500);
    if (highlight) bus.dispatchEvent(new CustomEvent('hl', { detail: { summary: m, highlight } }));
  });
  useSocketEvent<{ tournamentId: string }>('feed:changed', ({ tournamentId }) => {
    later(() => qc.invalidateQueries({ queryKey: ['feed', tournamentId] }, { cancelRefetch: false }), 2500);
  });
  // voltou a conexão: pode ter perdido lances no meio -> ressincroniza
  useOnReconnect(() => later(() => qc.invalidateQueries({ queryKey: ['feed'] }, { cancelRefetch: false }), 2000));
  useSocketEvent<{ tournamentId: string }>('standings:changed', ({ tournamentId }) => {
    qc.invalidateQueries({ queryKey: ['standings', tournamentId] });
  });
}

const feedQuery = (tournamentId?: string) => ({
  queryKey: ['feed', tournamentId],
  queryFn: () => get<MatchSummary[]>(`/public/tournaments/${tournamentId}/feed`),
  enabled: !!tournamentId,
  staleTime: 30_000,
  refetchOnWindowFocus: true,
});

export function useFeed(tournamentId?: string) {
  return useQuery(feedQuery(tournamentId));
}

/** Modalidades presentes no feed, como lista estável (não muda a cada lance). */
export function useFeedSportIds(tournamentId?: string) {
  const q = useQuery({ ...feedQuery(tournamentId), select: (l: MatchSummary[]) => [...new Set(l.map((m) => m.sportId))].sort().join('|') });
  return useMemo(() => (q.data ? q.data.split('|') : []), [q.data]);
}
