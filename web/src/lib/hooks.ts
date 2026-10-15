import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { serverNow } from './socket';

/**
 * true depois que a página desceu um pouco. Histerese (entra em `down`, sai
 * em `up`) pra barra não piscar quando o scroll para bem no limite.
 */
export function useScrolled(down = 56, up = 16) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const y = window.scrollY;
      setOn((cur) => (cur ? y > up : y > down));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [down, up]);
  return on;
}

// Um relógio por intervalo, compartilhado por todos os componentes e alinhado à
// virada do segundo: todos os cards ao vivo trocam o 12:34 -> 12:35 no mesmo frame.
const tickers = new Map<number, { now: number; subs: Set<() => void>; timer?: ReturnType<typeof setTimeout> }>();
const ticker = (ms: number) => {
  let t = tickers.get(ms);
  if (!t) tickers.set(ms, (t = { now: serverNow(), subs: new Set() }));
  return t;
};
function subscribeTick(ms: number, cb: () => void) {
  const t = ticker(ms);
  t.subs.add(cb);
  if (t.subs.size === 1) {
    const tick = () => {
      t.now = serverNow();
      t.subs.forEach((f) => f());
      t.timer = setTimeout(tick, ms - (serverNow() % ms) + 8);
    };
    tick();
  }
  return () => {
    t.subs.delete(cb);
    if (!t.subs.size) clearTimeout(t.timer);
  };
}
const noop = () => () => {};

/** Relógio que bate a cada `ms` (no tempo do servidor). Desligado = valor parado. */
export function useNow(ms = 1000, enabled = true) {
  const sub = useCallback((cb: () => void) => (enabled ? subscribeTick(ms, cb) : noop()), [ms, enabled]);
  return useSyncExternalStore(sub, () => ticker(ms).now);
}

const FAV_KEY = 'arq.favs';
const readFavs = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
  } catch {
    return [];
  }
};

/** Atléticas favoritas (por aparelho). */
export function useFavorites() {
  const [favs, setFavs] = useState<string[]>(readFavs);
  useEffect(() => {
    const on = () => setFavs(readFavs());
    window.addEventListener('arq:favs', on);
    return () => window.removeEventListener('arq:favs', on);
  }, []);
  const toggle = (id: string) => {
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setFavs(next);
    window.dispatchEvent(new Event('arq:favs'));
  };
  return { favs, toggle, isFav: (id?: string | null) => !!id && favs.includes(id) };
}

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

/** Mantém a tela acesa (console do mesário). */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: any = null;
    const req = async () => {
      try {
        lock = await (navigator as any).wakeLock.request('screen');
      } catch {
        /* sem permissão */
      }
    };
    void req();
    const vis = () => {
      if (document.visibilityState === 'visible') void req();
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      lock?.release?.();
    };
  }, [enabled]);
}

export const vibrate = (p: number | number[] = 12) => {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* ignore */
  }
};
