// Feed público: um dia por tela. Arrasta pro lado troca o dia; abre já no
// "jogo do momento" (ao vivo > último encerrado > primeiro do dia) via âncora
// #jogo-<id>; botão flutuante volta pro jogo ao vivo.
import { AnimatePresence, motion, PanInfo } from 'framer-motion';
import { CalendarX2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MatchSummary } from '@shared/types';
import { MatchCard } from '@/components/match/MatchCard';
import { cx, Empty, LiveDot } from '@/components/ui/primitives';
import { TeamFlag } from '@/components/ui/TeamFlag';
import { useFeed } from '@/lib/data';
import { anchorId, byTime, feedDays, initialDay, involves, liveTarget, matchFromHash, momentMatch, openingPoint } from '@/lib/feed';
import { dayChip, dayKey } from '@/lib/format';
import { useProfile } from '@/lib/profile';
import { SANDBOX } from '@/lib/sandbox';
import { serverNow } from '@/lib/socket';
import { usePublic } from './PublicLayout';

const HEADER_OFFSET = SANDBOX ? 104 : 74; // cabeçalho fixo (+ faixa do sandbox)

export default function Home() {
  const { tournament, inst } = usePublic();
  const feed = useFeed(tournament?.id);
  const { profile } = useProfile();
  const prefs = useMemo(() => ({ atleticaId: profile.atleticaId, sportIds: profile.sportIds }), [profile.atleticaId, profile.sportIds]);
  const onlyMine = profile.onlyMine && !!profile.atleticaId;
  const mine = profile.atleticaId ? inst.get(profile.atleticaId) : undefined;

  const today = dayKey(serverNow());
  const all = feed.data ?? [];
  const visible = useMemo(() => (onlyMine ? all.filter((m) => involves(m, profile.atleticaId)) : all), [all, onlyMine, profile.atleticaId]);
  const days = useMemo(() => feedDays(all, tournament, today), [all, tournament, today]);
  const byDay = useMemo(() => {
    const map = new Map<string, MatchSummary[]>();
    for (const m of visible) {
      const k = dayKey(m.scheduledAt);
      (map.get(k) ?? map.set(k, []).get(k)!).push(m);
    }
    for (const l of map.values()) l.sort(byTime);
    return map;
  }, [visible]);

  const [day, setDay] = useState<string | null>(null);
  const [dir, setDir] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const pending = useRef<{ id: string; smooth: boolean } | null>(null);

  // primeira carga: âncora da URL (link compartilhado) ou jogo do momento
  const ready = !feed.isLoading && !!feed.data;
  const booted = useRef(false);
  useEffect(() => {
    if (!ready || booted.current) return;
    booted.current = true;
    const start = openingPoint(visible, days, today, prefs, matchFromHash(window.location.hash));
    setDay(start.day);
    if (start.matchId) pending.current = { id: start.matchId, smooth: false };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = day ?? initialDay(days, (k) => byDay.get(k)?.length ?? 0, today);
  const list = byDay.get(current) ?? [];
  const idx = days.indexOf(current);

  const goTo = useCallback(
    (d: string, focusId?: string | null, smooth = true) => {
      setDir(d > current ? 1 : d < current ? -1 : 0);
      setDay(d);
      setOpen(null);
      const target = focusId ?? momentMatch(byDay.get(d) ?? [], prefs)?.id ?? null;
      pending.current = target ? { id: target, smooth } : null;
      if (!target) window.scrollTo({ top: 0 });
      history.replaceState(null, '', target ? `#${anchorId(target)}` : window.location.pathname + window.location.search);
    },
    [current, byDay, prefs],
  );
  const step = (n: number) => {
    const d = days[idx + n];
    if (d) goTo(d, null, false);
  };

  // rola até o card pedido; se trocou de dia, espera a página nova assentar
  const lastDay = useRef<string | null>(null);
  useLayoutEffect(() => {
    const p = pending.current;
    if (!p || !document.getElementById(anchorId(p.id))) return;
    pending.current = null;
    const changed = lastDay.current !== null && lastDay.current !== current;
    lastDay.current = current;
    const scroll = (behavior: ScrollBehavior) => {
      const el = document.getElementById(anchorId(p.id));
      if (!el) return;
      const y = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
      window.scrollTo({ top: Math.max(0, y), behavior });
    };
    if (changed) setTimeout(() => scroll(p.smooth ? 'smooth' : 'auto'), 380);
    else requestAnimationFrame(() => scroll(p.smooth ? 'smooth' : 'auto'));
  });
  useEffect(() => {
    if (lastDay.current === null && day) lastDay.current = day;
  }, [day]);

  // link #jogo-… colado/compartilhado com o app já aberto
  useEffect(() => {
    const on = () => {
      const id = matchFromHash(window.location.hash);
      const m = id && all.find((x) => x.id === id);
      if (m) goTo(dayKey(m.scheduledAt), m.id);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [all, goTo]);

  // setas do teclado no desktop
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,[role=dialog]')) return;
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -70 || info.velocity.x < -450) step(1);
    else if (info.offset.x > 70 || info.velocity.x > 450) step(-1);
  };

  // botão flutuante: some se não tem jogo ao vivo ou se ele já está na tela
  const live = liveTarget(visible, prefs);
  const liveInView = useInView(live && dayKey(live.scheduledAt) === current ? anchorId(live.id) : null);

  if (!tournament) return <Empty icon={<CalendarX2 className="h-6 w-6" />} title="Nenhum torneio no ar">Assim que a organização publicar a tabela, os jogos aparecem aqui.</Empty>;

  const chip = dayChip(current, today);
  const nextWithGames = days.slice(idx + 1).find((d) => byDay.get(d)?.length);

  return (
    <div className="overflow-x-hidden">
      {/* cabeçalho do dia */}
      <div className="flex items-center justify-between px-4 pb-1 pt-4">
        <button onClick={() => step(-1)} disabled={idx <= 0} aria-label="Dia anterior" className="rounded-full p-2 text-mute transition hover:text-white disabled:opacity-0">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.div key={current} custom={dir} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ duration: 0.18 }}>
              <div className={cx('font-display text-[34px] uppercase leading-none', chip.diff === 0 && 'text-pop-orange')}>{chip.top}</div>
              <div className="mt-1 text-[12px] font-semibold text-mute">
                {chip.bottom} {list.length ? `· ${list.length} jogo${list.length > 1 ? 's' : ''}` : ''}
              </div>
            </motion.div>
          </AnimatePresence>
          <div className="mt-2 flex justify-center gap-1">
            {days.map((d, i) =>
              Math.abs(i - idx) <= 4 ? (
                <button key={d} onClick={() => goTo(d, null, false)} aria-label={dayChip(d, today).top} className={cx('h-1.5 rounded-full transition-all', d === current ? 'w-5 bg-white' : byDay.get(d)?.length ? 'w-1.5 bg-white/30' : 'w-1.5 bg-white/10')} />
              ) : null,
            )}
          </div>
        </div>
        <button onClick={() => step(1)} disabled={idx >= days.length - 1} aria-label="Próximo dia" className="rounded-full p-2 text-mute transition hover:text-white disabled:opacity-0">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* páginas: arrastar pros lados */}
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.div
          key={current}
          custom={dir}
          variants={{ enter: (d: number) => ({ x: d >= 0 ? '60%' : '-60%', opacity: 0 }), center: { x: 0, opacity: 1 }, exit: (d: number) => ({ x: d >= 0 ? '-60%' : '60%', opacity: 0 }) }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: 'spring', stiffness: 360, damping: 36 }}
          drag="x"
          dragDirectionLock
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.22}
          onDragEnd={onDragEnd}
          className="min-h-[60vh] px-4 pb-10 pt-3"
          style={{ touchAction: 'pan-y' }}
        >
          {feed.isLoading ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-[132px] rounded-[18px]" />
              ))}
            </div>
          ) : list.length ? (
            <div className="space-y-2.5">
              {list.map((m) => (
                <div key={m.id} id={anchorId(m.id)} style={{ scrollMarginTop: HEADER_OFFSET }}>
                  <MatchCard m={m} expanded={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)} />
                </div>
              ))}
              {/* fim do dia: espaço pra qualquer card (inclusive o último) poder ficar no topo */}
              <div className="flex flex-col items-center justify-start pt-8 text-center" style={{ minHeight: 'calc(100dvh - 300px)' }}>
                <span className="tag bg-coal text-pop-yellow">fim_do_dia</span>
                {idx < days.length - 1 && (
                  <button onClick={() => step(1)} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-mute hover:text-white">
                    Arraste pro lado ou toque pra ver {dayChip(days[idx + 1], today).top.toLowerCase()} <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <Empty icon={onlyMine && mine ? <TeamFlag inst={mine} size={40} /> : <CalendarX2 className="h-6 w-6" />} title={onlyMine && mine ? `O ${mine.name} não joga ${chip.diff === 0 ? 'hoje' : 'nesse dia'}` : 'Sem jogos nesse dia'}>
              {nextWithGames && (
                <button className="mt-2 font-semibold text-white underline underline-offset-4" onClick={() => goTo(nextWithGames, null, false)}>
                  Ir pro próximo dia com jogo
                </button>
              )}
              <p className="mt-3 text-[12px] text-mute-2">Arraste pro lado pra navegar entre os dias</p>
            </Empty>
          )}
        </motion.div>
      </AnimatePresence>

      {/* volta pro jogo ao vivo */}
      <AnimatePresence>
        {live && !liveInView && (
          <motion.a
            href={`#${anchorId(live.id)}`}
            onClick={(e) => {
              e.preventDefault();
              goTo(dayKey(live.scheduledAt), live.id);
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileTap={{ scale: 0.9 }}
            aria-label="Ir pro jogo ao vivo"
            title="Jogo ao vivo"
            className="fixed bottom-[calc(88px+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-coal text-snow shadow-glow sm:bottom-8 sm:right-[max(1rem,calc(50vw-380px+1rem))]"
          >
            <LiveDot className="scale-150" />
          </motion.a>
        )}
      </AnimatePresence>
    </div>
  );
}

/** true quando o elemento com esse id está pelo menos 40% visível. */
function useInView(id: string | null) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    setInView(false);
    if (!id) return;
    let io: IntersectionObserver | null = null;
    const t = setInterval(() => {
      const el = document.getElementById(id);
      if (!el || io) return;
      io = new IntersectionObserver(([e]) => setInView(e.intersectionRatio >= 0.4), { threshold: [0, 0.4, 1] });
      io.observe(el);
    }, 250);
    return () => {
      clearInterval(t);
      io?.disconnect();
    };
  }, [id]);
  return inView;
}
