// Conexão única de WebSocket (socket.io, namespace /live) compartilhada pelo app.
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { report } from './log';

let socket: Socket | null = null;
let offset = 0; // relógio do servidor - relógio local
const rooms = new Map<string, number>(); // sala -> nº de componentes interessados
const reconnectSubs = new Set<() => void>();

/** Chamado a cada reconexão (não na primeira conexão). */
export function useOnReconnect(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const f = () => ref.current();
    reconnectSubs.add(f);
    return () => void reconnectSubs.delete(f);
  }, []);
}

function syncTime(s: Socket) {
  const t0 = Date.now();
  s.timeout(5000).emit('time', (err: unknown, r: { serverTime: number }) => {
    if (err || !r) return;
    const t1 = Date.now();
    offset = r.serverTime - (t0 + t1) / 2;
  });
}

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io('/live', { transports: ['websocket', 'polling'], reconnectionDelay: 800, reconnectionDelayMax: 6000 });
  socket.on('hello', (p: { serverTime: number }) => {
    offset = p.serverTime - Date.now();
    syncTime(socket!);
  });
  // quedas e voltas da conexão em tempo real (ajuda a explicar "o placar não atualizou")
  let downAt = 0;
  socket.on('disconnect', (reason) => {
    downAt = Date.now();
    if (reason !== 'io client disconnect') report('info', 'socket.disconnect', { msg: reason, data: { online: navigator.onLine } });
  });
  socket.on('connect_error', (e) => report('warn', 'socket.connect_error', { msg: e.message }));
  socket.on('connect', () => {
    if (downAt) {
      report('info', 'socket.reconnect', { data: { downMs: Date.now() - downAt } });
      // quem ficou de fora pode ter perdido lances: avisa pra ressincronizar
      reconnectSubs.forEach((fn) => fn());
    }
    downAt = 0;
    const list = [...rooms.keys()];
    if (list.length) socket!.emit('join', list);
  });
  return socket;
}

/** Agora, no relógio do servidor (o cronômetro do jogo depende disso). */
export const serverNow = () => Date.now() + offset;

export function useRooms(list: (string | null | undefined)[]) {
  const key = list.filter(Boolean).join('|');
  useEffect(() => {
    const s = getSocket();
    const names = key ? key.split('|') : [];
    const fresh = names.filter((r) => !rooms.has(r));
    for (const r of names) rooms.set(r, (rooms.get(r) ?? 0) + 1);
    if (fresh.length && s.connected) s.emit('join', fresh);
    return () => {
      const gone: string[] = [];
      for (const r of names) {
        const n = (rooms.get(r) ?? 1) - 1;
        if (n <= 0) {
          rooms.delete(r);
          gone.push(r);
        } else rooms.set(r, n);
      }
      if (gone.length && s.connected) s.emit('leave', gone);
    };
  }, [key]);
}

export function useSocketEvent<T = any>(event: string, handler: (payload: T) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const s = getSocket();
    const fn = (p: T) => ref.current(p);
    s.on(event, fn);
    return () => {
      s.off(event, fn);
    };
  }, [event]);
}

export function useConnected() {
  const [on, setOn] = useState(() => getSocket().connected);
  useEffect(() => {
    const s = getSocket();
    const up = () => setOn(true);
    const down = () => setOn(false);
    s.on('connect', up);
    s.on('disconnect', down);
    return () => {
      s.off('connect', up);
      s.off('disconnect', down);
    };
  }, []);
  return on;
}
