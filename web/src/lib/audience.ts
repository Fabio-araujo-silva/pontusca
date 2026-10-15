// Audiência: o site público conta pro servidor quais jogos estão na tela e
// qual está aberto. Só serve pro painel do admin ("quantos estão vendo").
// Nada pessoal sai daqui: só ids de jogo, agregados por aba.
import { RefObject, useEffect } from 'react';
import { getSocket } from './socket';

const onScreen = new Map<string, number>(); // id -> nº de cards visíveis (o mesmo jogo pode aparecer 2x)
let open: string | null = null;
let sandbox = false;
let mounted = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

function send() {
  const s = getSocket();
  if (!mounted) return void s.emit('watch', { off: true });
  // aba em segundo plano / tela apagada: continua online, mas não está "vendo" nada
  const hidden = document.visibilityState === 'hidden';
  s.emit('watch', { sandbox, open: hidden ? null : open, watching: hidden ? [] : [...onScreen.keys()] });
}

// agrupa as mudanças da rolagem num envio só
function schedule(delay = 400) {
  clearTimeout(timer);
  timer = setTimeout(send, delay);
}

/** Montado uma vez no layout público. */
export function useAudience(focused: string | null, isSandbox: boolean) {
  useEffect(() => {
    mounted++;
    const s = getSocket();
    const resend = () => send();
    const vis = () => schedule(0);
    s.on('connect', resend);
    document.addEventListener('visibilitychange', vis);
    return () => {
      mounted--;
      s.off('connect', resend);
      document.removeEventListener('visibilitychange', vis);
      schedule(0);
    };
  }, []);
  useEffect(() => {
    open = focused;
    sandbox = isSandbox;
    schedule(0);
  }, [focused, isSandbox]);
}

/** Card de jogo: conta como "na tela" com metade dele visível (ou boa parte da tela, se expandido). */
export function useOnScreen(ref: RefObject<Element>, id: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let seen = false;
    const set = (v: boolean) => {
      if (v === seen) return;
      seen = v;
      const n = (onScreen.get(id) ?? 0) + (v ? 1 : -1);
      if (n > 0) onScreen.set(id, n);
      else onScreen.delete(id);
      schedule();
    };
    const io = new IntersectionObserver(([e]) => set(e.isIntersecting && (e.intersectionRatio >= 0.5 || e.intersectionRect.height >= window.innerHeight * 0.4)), {
      threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
    });
    io.observe(el);
    return () => {
      io.disconnect();
      set(false);
    };
  }, [ref, id]);
}
