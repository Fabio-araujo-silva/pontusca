// Estado do console do mesário: motor local otimista + fila offline.
//
// Cada toque vira um evento otimista (id "tmp-<clientId>") calculado pelo
// MESMO motor do servidor e entra numa fila persistida em localStorage. A fila
// é enviada em ordem; sem rede, tenta de novo com backoff. O clientId garante
// que um retry nunca duplica o lance no servidor.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildEvent, EngineError, EngineInput, runEngine } from '@shared/engine';
import type { EngineEvent, MatchCommand, MatchDetail, MatchSummary, Side } from '@shared/types';
import { ApiError, get, post, put } from '@/lib/api';
import { vibrate } from '@/lib/hooks';
import { serverNow, useConnected, useRooms, useSocketEvent } from '@/lib/socket';
import { toast } from '@/components/ui/primitives';
import type { Cmd, EngineState, MesaMatch } from './types';

interface QueueItem {
  clientId: string;
  cmd: MatchCommand;
  event: EngineEvent;
}

const qKey = (id: string) => `arq.mesa.queue.${id}`;
const loadQueue = (id: string): QueueItem[] => {
  try {
    return JSON.parse(localStorage.getItem(qKey(id)) || '[]');
  } catch {
    return [];
  }
};
const saveQueue = (id: string, q: QueueItem[]) => {
  try {
    if (q.length) localStorage.setItem(qKey(id), JSON.stringify(q));
    else localStorage.removeItem(qKey(id));
  } catch {
    /* ignore */
  }
};
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isNetwork = (e: unknown) => !(e instanceof ApiError) || e.status >= 500 || e.status === 408 || e.status === 429;

export function useConsole(id: string) {
  const [data, setData] = useState<MesaMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueueState] = useState<QueueItem[]>(() => loadQueue(id));
  const [syncIssue, setSyncIssue] = useState(false);
  const queueRef = useRef(queue);
  const inflight = useRef<string | null>(null);
  const flushing = useRef(false);
  const alive = useRef(true);
  const dataRef = useRef(data);
  dataRef.current = data;
  const connected = useConnected();

  const setQueue = useCallback(
    (fn: (q: QueueItem[]) => QueueItem[]) => {
      queueRef.current = fn(queueRef.current);
      saveQueue(id, queueRef.current);
      setQueueState(queueRef.current);
    },
    [id],
  );

  const reload = useCallback(async () => {
    try {
      const d = await get<MesaMatch>(`/mesa/matches/${id}`);
      if (!alive.current) return;
      setData(d);
      setError(null);
    } catch (e: any) {
      if (!dataRef.current) setError(e.message || 'Falha ao carregar o jogo.');
    }
  }, [id]);

  useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);

  // ---- motor local
  const events = useMemo(() => (data ? [...data.engine.events, ...queue.map((q) => q.event)] : []), [data, queue]);
  const input = useMemo<EngineInput | null>(
    () => (data ? { config: data.engine.config, events, names: data.engine.names, participants: data.engine.participants, manual: data.engine.manual } : null),
    [data, events],
  );
  const out = useMemo(() => (input ? runEngine(input) : null), [input]);
  const outRef = useRef(out);
  outRef.current = out;
  const inputRef = useRef(input);
  inputRef.current = input;

  // ---- envio da fila
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    let delay = 1000;
    let mustReload = false;
    try {
      while (alive.current && queueRef.current.length) {
        const item = queueRef.current[0];
        inflight.current = item.clientId;
        try {
          const r = await post<{ summary: MatchSummary; event: EngineEvent | null; duplicate: boolean }>(`/mesa/matches/${id}/commands`, item.cmd);
          delay = 1000;
          setSyncIssue(false);
          const ev = r.event;
          if (ev) {
            setData((d) => (d && !d.engine.events.some((e) => e.id === ev.id) ? { ...d, engine: { ...d.engine, events: [...d.engine.events, ev] } } : d));
          } else mustReload = true;
          setQueue((q) => q.filter((x) => x.clientId !== item.clientId));
        } catch (e: any) {
          if (!isNetwork(e)) {
            setQueue((q) => q.filter((x) => x.clientId !== item.clientId));
            toast.err(e.message || 'Lance recusado pelo servidor.');
            vibrate([40, 60, 40]);
            mustReload = true;
            if (e.status === 401 || e.status === 403) break;
          } else {
            setSyncIssue(true);
            await sleep(delay);
            delay = Math.min(delay * 2, 15000);
          }
        }
      }
    } finally {
      inflight.current = null;
      flushing.current = false;
    }
    if (mustReload && alive.current) await reload();
  }, [id, reload, setQueue]);

  useEffect(() => {
    if (queueRef.current.length) void flush();
    const on = () => void flush();
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [flush]);
  useEffect(() => {
    if (connected && queueRef.current.length) void flush();
  }, [connected, flush]);

  /** Registra um lance. Devolve false se o motor recusou. */
  const send = useCallback(
    (cmd: Cmd): boolean => {
      const inp = inputRef.current;
      const o = outRef.current;
      if (!inp || !o) return false;
      const clientId = uuid();
      const full = { ...cmd, clientId } as MatchCommand;
      let draft;
      try {
        draft = buildEvent(inp, o, full, serverNow());
      } catch (e) {
        if (e instanceof EngineError) toast.err(e.message);
        else toast.err('Não deu pra registrar esse lance.');
        vibrate([30, 50, 30]);
        return false;
      }
      const last = inp.events[inp.events.length - 1];
      const event: EngineEvent = { id: `tmp-${clientId}`, seq: (last?.seq ?? 0) + 1, at: serverNow(), ...draft, payload: draft.payload ?? {} };
      // atualiza os refs já: dois toques no mesmo frame não usam estado velho
      inputRef.current = { ...inp, events: [...inp.events, event] };
      outRef.current = runEngine(inputRef.current);
      setQueue((q) => [...q, { clientId, cmd: full, event }]);
      vibrate(14);
      void flush();
      return true;
    },
    [flush, setQueue],
  );

  const voidEvent = useCallback(
    async (eventId: string) => {
      const baseId = eventId.split(':')[0];
      if (baseId.startsWith('tmp-')) {
        const cid = baseId.slice(4);
        if (inflight.current === cid) {
          toast.info('Esse lance está sendo enviado — tente em instantes.');
          return false;
        }
        setQueue((q) => q.filter((x) => x.clientId !== cid));
        toast.ok('Lance removido');
        return true;
      }
      try {
        await post(`/mesa/matches/${id}/events/${baseId}/void`);
        await reload();
        toast.ok('Lance desfeito');
        vibrate(20);
        return true;
      } catch (e: any) {
        toast.err(e.message);
        return false;
      }
    },
    [id, reload, setQueue],
  );

  // ---- edições fora do motor
  const patchFrom = useCallback((r: { detail?: MatchDetail; engine?: EngineState }) => {
    setData((d) => (d ? { ...d, ...(r.detail && { detail: r.detail }), ...(r.engine && { engine: r.engine }) } : d));
  }, []);

  const saveLineup = useCallback(
    async (side: Side, players: { athleteId: string; number: number | null; position: string | null; starter: boolean; captain: boolean }[]) => {
      const detail = await put<MatchDetail>(`/mesa/matches/${id}/lineup`, { side, players });
      await reload();
      return detail;
    },
    [id, reload],
  );

  const addAthlete = useCallback(
    async (side: Side, name: string, number: number | null, starter: boolean) => {
      const r = await post<{ athlete: { id: string }; detail: MatchDetail; engine: EngineState }>(`/mesa/matches/${id}/athletes`, { side, name, number, starter });
      patchFrom(r);
      void reload(); // atualiza o elenco (meta.roster)
      return r.athlete.id;
    },
    [id, patchFrom, reload],
  );

  const saveParticipants = useCallback(
    async (participants: { id?: string; institutionId: string; athleteName: string | null; lane: number | null }[]) => {
      const r = await put<{ detail: MatchDetail; engine: EngineState }>(`/mesa/matches/${id}/participants`, { participants });
      patchFrom(r);
    },
    [id, patchFrom],
  );

  const pendingIds = useMemo(() => new Set(queue.map((q) => q.event.id)), [queue]);

  // ---- tempo real
  useRooms([`match:${id}`]);
  useSocketEvent<{ summary: MatchSummary }>('summary', ({ summary }) => {
    if (summary.id !== id || queueRef.current.length || flushing.current) return;
    const d = dataRef.current;
    const o = outRef.current;
    if (!d || !o) return;
    const localSeq = d.engine.events.reduce((m, e) => Math.max(m, e.seq), 0);
    const differs = summary.score.home !== o.score.home || summary.score.away !== o.score.away || summary.live.phase !== o.live.phase || summary.live.period !== o.live.period || summary.manual !== !!d.engine.manual;
    if (summary.seq !== localSeq || differs) void reload();
  });
  useSocketEvent<{ matchId: string }>('staff:changed', (p) => {
    if (p.matchId === id) void reload();
  });
  useEffect(() => {
    const vis = () => {
      if (document.visibilityState === 'visible' && !queueRef.current.length) void reload();
    };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, [reload]);

  return {
    data,
    error,
    out,
    events,
    pending: queue.length,
    pendingIds,
    syncIssue,
    connected,
    send,
    voidEvent,
    reload,
    saveLineup,
    addAthlete,
    saveParticipants,
  };
}

export type ConsoleApi = ReturnType<typeof useConsole>;
