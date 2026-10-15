// Estado do console do mesário: motor local otimista + fila offline.
//
// Cada toque vira um evento otimista (id "tmp-<clientId>") calculado pelo
// MESMO motor do servidor e entra numa fila persistida em localStorage. A fila
// é enviada em ordem; sem rede, tenta de novo com backoff. O clientId garante
// que um retry nunca duplica o lance no servidor.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authorSlots, buildEvent, EngineError, EngineInput, missingAuthor, runEngine } from '@shared/engine';
import type { EngineEvent, MatchCommand, MatchDetail, MatchSummary, Side } from '@shared/types';
import { ApiError, get, patch, post, put } from '@/lib/api';
import { report } from '@/lib/log';
import { vibrate } from '@/lib/hooks';
import { serverNow, useConnected, useRooms, useSocketEvent } from '@/lib/socket';
import { toast } from '@/components/ui/primitives';
import type { Cmd, EngineState, MesaMatch } from './types';

/** Quem fez o lance (undefined = não mexe). */
export interface Who {
  athleteId?: string | null;
  athlete2Id?: string | null;
}

interface QueueItem {
  clientId: string;
  cmd?: MatchCommand; // lance novo
  event?: EngineEvent; // versão otimista do lance
  assign?: Who & { target: string }; // autor atribuído depois (id do servidor ou tmp-<clientId>)
}

/** Lance que acabou de entrar e ainda pede autor ("quem fez?"). */
export interface AuthorAsk {
  eventId: string;
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
const idsKey = (id: string) => `arq.mesa.ids.${id}`;
const loadIds = (id: string): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(idsKey(id)) || '{}');
  } catch {
    return {};
  }
};
const clean = (w: Who): Who => Object.fromEntries(Object.entries(w).filter(([, v]) => v !== undefined));

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isNetwork = (e: unknown) => !(e instanceof ApiError) || e.status >= 500 || e.status === 408 || e.status === 429;

export function useConsole(id: string) {
  const [data, setData] = useState<MesaMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueueState] = useState<QueueItem[]>(() => loadQueue(id));
  const [syncIssue, setSyncIssue] = useState(false);
  // envio parado por permissão: 'auth' = sessão expirou; 'forbidden' = sem permissão agora
  // (reserva bloqueado / trocaram o mesário). Os lances ficam guardados até resolver.
  const [blocked, setBlocked] = useState<null | 'auth' | 'forbidden'>(null);
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  // o servidor mudou enquanto a fila enviava: recarrega quando ela esvaziar
  const dirty = useRef(false);
  const queueRef = useRef(queue);
  const inflight = useRef<string | null>(null);
  const flushing = useRef(false);
  const alive = useRef(true);
  const [ask, setAsk] = useState<AuthorAsk | null>(null);
  // clientId -> id do servidor (pra atribuir autor a um lance que já subiu)
  const idMap = useRef<Record<string, string>>(
    (() => {
      if (loadQueue(id).length) return loadIds(id);
      try {
        localStorage.removeItem(idsKey(id));
      } catch {
        /* ignore */
      }
      return {};
    })(),
  );
  const resolveId = useCallback((eid: string) => (eid.startsWith('tmp-') ? (idMap.current[eid.slice(4)] ?? eid) : eid), []);
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
      if (blockedRef.current === 'forbidden' && d.meta.canOperate) setBlocked(null);
    } catch (e: any) {
      if (!dataRef.current) setError(e.message || 'Falha ao carregar o jogo.');
      // jogo apagado ou tiraram você dele: não deixa seguir operando "no escuro"
      else if (e instanceof ApiError && e.status === 404) setError('Este jogo não existe mais (foi apagado pelo admin).');
      else if (e instanceof ApiError && e.status === 403) setData((x) => (x ? { ...x, meta: { ...x.meta, canOperate: false } } : x));
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
  const events = useMemo(() => {
    if (!data) return [];
    const list = [...data.engine.events, ...queue.filter((q) => q.event).map((q) => q.event!)];
    const assigns = queue.filter((q) => q.assign);
    if (!assigns.length) return list;
    return list.map((e) => {
      let x = e;
      for (const q of assigns) if (resolveId(q.assign!.target) === e.id || q.assign!.target === e.id) x = { ...x, ...clean(q.assign!) };
      return x;
    });
  }, [data, queue, resolveId]);
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
    if (flushing.current || blockedRef.current) return;
    flushing.current = true;
    let delay = 1000;
    let mustReload = false;
    try {
      while (alive.current && queueRef.current.length) {
        const item = queueRef.current[0];
        inflight.current = item.clientId;
        try {
          if (item.assign) {
            const target = resolveId(item.assign.target);
            if (target.startsWith('tmp-')) {
              // o lance original foi recusado/descartado: nada pra atribuir
              setQueue((q) => q.filter((x) => x.clientId !== item.clientId));
              continue;
            }
            const who = clean({ athleteId: item.assign.athleteId, athlete2Id: item.assign.athlete2Id });
            await patch(`/mesa/matches/${id}/events/${target}`, who);
            delay = 1000;
            setSyncIssue(false);
            setData((d) => (d ? { ...d, engine: { ...d.engine, events: d.engine.events.map((e) => (e.id === target ? { ...e, ...who } : e)) } } : d));
            setQueue((q) => q.filter((x) => x.clientId !== item.clientId));
            continue;
          }
          const r = await post<{ summary: MatchSummary; event: EngineEvent | null; duplicate: boolean }>(`/mesa/matches/${id}/commands`, item.cmd);
          delay = 1000;
          setSyncIssue(false);
          const ev = r.event;
          if (ev) {
            idMap.current[item.clientId] = ev.id;
            try {
              localStorage.setItem(idsKey(id), JSON.stringify(idMap.current));
            } catch {
              /* ignore */
            }
            setData((d) => (d && !d.engine.events.some((e) => e.id === ev.id) ? { ...d, engine: { ...d.engine, events: [...d.engine.events, ev] } } : d));
          } else mustReload = true;
          setQueue((q) => q.filter((x) => x.clientId !== item.clientId));
        } catch (e: any) {
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
            // NÃO descarta: o lance aconteceu. Guarda até logar de novo / ser liberado.
            report('warn', 'mesa.blocked', { msg: e.message, req: e.requestId, data: { match: id, status: e.status, queued: queueRef.current.length } });
            setBlocked(e.status === 401 ? 'auth' : 'forbidden');
            mustReload = e.status === 403;
            break;
          } else if (!isNetwork(e)) {
            report('warn', 'mesa.rejected', { msg: e.message, req: e.requestId, data: { match: id, status: e.status, cmd: item.cmd ?? null, assign: item.assign ?? null, queued: queueRef.current.length } });
            setQueue((q) => q.filter((x) => x.clientId !== item.clientId));
            toast.err(e.message || 'Lance recusado pelo servidor.');
            vibrate([40, 60, 40]);
            mustReload = true;
          } else {
            report('info', 'mesa.retry', { msg: e?.message, req: e?.requestId, data: { match: id, queued: queueRef.current.length, delay, online: navigator.onLine } });
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
    if ((mustReload || (dirty.current && !queueRef.current.length)) && alive.current) {
      dirty.current = false;
      await reload();
    }
  }, [id, reload, setQueue, resolveId]);

  /** Joga fora os lances guardados (quando o admin confirma que não valem). */
  const discardQueue = useCallback(() => {
    report('warn', 'mesa.queue_discarded', { data: { match: id, items: queueRef.current.map((q) => q.cmd?.type ?? 'assign') } });
    setQueue(() => []);
    setBlocked(null);
    void reload();
  }, [id, reload, setQueue]);

  // liberado / logou de novo: volta a enviar
  useEffect(() => {
    if (!blocked) void flush();
  }, [blocked, flush]);

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
      // hora do toque: se ficar na fila sem sinal, o lance entra no minuto certo
      const full = { ...cmd, clientId, at: Math.round(serverNow()) } as MatchCommand;
      let draft;
      try {
        draft = buildEvent(inp, o, full, serverNow());
      } catch (e) {
        if (e instanceof EngineError) {
          toast.err(e.message);
          report('info', 'mesa.local_refused', { msg: e.message, data: { match: id, cmd: full } });
        } else {
          toast.err('Não deu pra registrar esse lance.');
          report('error', 'mesa.engine_crash', { err: e, data: { match: id, cmd: full, events: inp.events.length } });
        }
        vibrate([30, 50, 30]);
        return false;
      }
      const last = inp.events[inp.events.length - 1];
      const event: EngineEvent = { id: `tmp-${clientId}`, seq: (last?.seq ?? 0) + 1, at: serverNow(), ...draft, payload: draft.payload ?? {} };
      // atualiza os refs já: dois toques no mesmo frame não usam estado velho
      inputRef.current = { ...inp, events: [...inp.events, event] };
      outRef.current = runEngine(inputRef.current);
      setQueue((q) => [...q, { clientId, cmd: full, event }]);
      // marca primeiro, diz quem fez depois: abre a barra "quem fez?" sem travar o próximo lance
      if (authorSlots(event, inp.config) && missingAuthor(event, inp.config)) setAsk({ eventId: event.id });
      vibrate(14);
      void flush();
      return true;
    },
    [flush, setQueue],
  );

  /** Diz quem fez um lance (já enviado ou ainda na fila). Funciona offline. */
  const assign = useCallback(
    (eventId: string, who: Who) => {
      const w = clean(who);
      if (eventId.startsWith('tmp-')) {
        const cid = eventId.slice(4);
        const queued = queueRef.current.find((x) => x.clientId === cid && x.cmd);
        if (queued && inflight.current !== cid) {
          // ainda não subiu: mescla direto no comando
          setQueue((q) => q.map((x) => (x.clientId === cid ? { ...x, cmd: { ...x.cmd!, ...w }, event: { ...x.event!, ...w } } : x)));
          vibrate(10);
          return;
        }
      }
      setQueue((q) => [...q, { clientId: uuid(), assign: { target: eventId, ...w } }]);
      vibrate(10);
      void flush();
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
        toast.err(e instanceof ApiError ? e.message : 'Sem sinal: desfazer um lance já enviado precisa de conexão.');
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

  const pendingIds = useMemo(() => new Set(queue.filter((q) => q.event).map((q) => q.event!.id)), [queue]);
  const unassigned = useMemo(() => (data ? events.filter((e) => missingAuthor(e, data.engine.config)) : []), [data, events]);
  /** acha o lance mesmo depois que o id temporário virou o do servidor */
  const findEvent = useCallback((eid: string) => events.find((e) => e.id === eid || e.id === resolveId(eid)) ?? null, [events, resolveId]);

  // ---- tempo real
  useRooms([`match:${id}`, 'mesa']);
  useSocketEvent<{ summary: MatchSummary }>('summary', ({ summary }) => {
    if (summary.id !== id) return;
    // fila enviando: não recarrega agora (perderia o otimista), mas lembra de conferir depois
    if (queueRef.current.length || flushing.current) {
      dirty.current = true;
      return;
    }
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
  // admin mudou a modalidade (botões/regras): recarrega a configuração
  useSocketEvent('catalog:changed', () => {
    if (!queueRef.current.length) void reload();
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
    blocked,
    discardQueue,
    connected,
    send,
    voidEvent,
    assign,
    ask,
    setAsk,
    unassigned,
    findEvent,
    reload,
    saveLineup,
    addAthlete,
    saveParticipants,
  };
}

export type ConsoleApi = ReturnType<typeof useConsole>;
