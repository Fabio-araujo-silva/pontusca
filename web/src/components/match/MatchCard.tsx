// Card de jogo no estilo Apple Sports: escudo — placar — escudo, status no
// meio, e expande no lugar pra mostrar lance a lance, escalações e números.
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, MapPin, Star } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import type { Highlight, InstitutionDTO, MatchSummary } from '@shared/types';
import { usePublic } from '@/pages/public/PublicLayout';
import { useOnScreen } from '@/lib/audience';
import { onHighlight } from '@/lib/data';
import { alpha, fmtScore, onColor, teamTone } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { involves } from '@/lib/feed';
import { useProfile } from '@/lib/profile';
import { cx, LiveDot, ScoreNumber } from '../ui/primitives';
import { SportIcon } from '../ui/SportIcon';
import { TeamFlag } from '../ui/TeamFlag';
import { liveContext, phaseLine, sportLine, statusView, teamsOf } from './helpers';
import { celebratesFullscreen } from './Celebration';
import { MatchDetailPanel } from './MatchDetailPanel';
import { TimelineIcon } from './TimelineIcon';

export const MatchCard = memo(function MatchCard({ m, expanded, onToggle }: { m: MatchSummary; expanded?: boolean; onToggle?: () => void }) {
  const { inst, sport, focused } = usePublic();
  const sp = sport.get(m.sportId);
  const { profile } = useProfile();
  const fav = involves(m, profile.atleticaId);
  const flash = useCardFlash(m.id, focused, profile.atleticaId);
  const ref = useRef<HTMLElement>(null);
  useOnScreen(ref, m.id);

  return (
    <motion.article ref={ref} layout="position" className={cx('card relative overflow-hidden', expanded && 'ring-white/[0.12]')}>
      <button type="button" onClick={onToggle} className="relative z-10 block w-full overflow-hidden px-4 pb-3.5 pt-3 text-left" aria-expanded={expanded}>
        <AnimatePresence>{flash && <CardFlash key={flash.key} h={flash.h} m={m} inst={inst} />}</AnimatePresence>
        <div className="flex items-center gap-2 text-[12px] text-mute">
          <SportIcon name={sp?.icon} size={15} className="shrink-0 text-white/75" />
          <span className="truncate font-semibold text-white/80">{sportLine(m, sp)}</span>
          {phaseLine(m) && <span className="truncate">· {phaseLine(m)}</span>}
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {fav && <Star className="h-3 w-3 fill-warn text-warn" />}
            <ChevronDown className={cx('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
          </span>
        </div>
        {m.score.ranking ? <RankingBody m={m} inst={inst} /> : <HeadToHead m={m} inst={inst} />}
        {!expanded && <Footer m={m} />}
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div key="d" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 32 }} className="relative z-10 overflow-hidden">
            <MatchDetailPanel id={m.id} summary={m} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
});

function HeadToHead({ m, inst }: { m: MatchSummary; inst: Map<string, InstitutionDTO> }) {
  const { home, away } = teamsOf(m, inst);
  const live = m.status === 'LIVE';
  const now = useNow(1000, live && !!m.live.clock?.running);
  const st = statusView(m, now);
  const showScore = m.status === 'LIVE' || m.status === 'FINISHED';
  const winH = m.status === 'FINISHED' && m.winner === 'home';
  const winA = m.status === 'FINISHED' && m.winner === 'away';
  const ctx = liveContext(m);
  const sh = m.score.shootout;
  return (
    <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <Team inst={home} dim={winA} serving={m.score.tennis?.server === 'home'} batting={m.score.baseball && m.live.phase === 'PERIOD' ? m.score.baseball.half === 'bottom' : false} />
      <div className="flex min-w-[118px] flex-col items-center">
        {showScore ? (
          <div className="flex items-baseline gap-3 font-display text-[44px] font-bold leading-none">
            {sh && (sh.home || sh.away) ? <span className="self-center text-[15px] font-semibold text-mute">({sh.home})</span> : null}
            <ScoreNumber value={m.score.home} dim={winA} />
            <span className="text-[26px] text-white/25">–</span>
            <ScoreNumber value={m.score.away} dim={winH} />
            {sh && (sh.home || sh.away) ? <span className="self-center text-[15px] font-semibold text-mute">({sh.away})</span> : null}
          </div>
        ) : (
          <div className={cx('font-display text-[34px] font-bold leading-none tabular', st.kind === 'off' && 'text-mute line-through decoration-2')}>{st.kind === 'off' ? timeOf(m) : st.main}</div>
        )}
        <StatusLine st={st} />
        {ctx && <div className="mt-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold tabular text-white/80">{ctx}</div>}
      </div>
      <Team inst={away} dim={winH} right serving={m.score.tennis?.server === 'away'} batting={m.score.baseball && m.live.phase === 'PERIOD' ? m.score.baseball.half === 'top' : false} />
    </div>
  );
}

const timeOf = (m: MatchSummary) => new Date(m.scheduledAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

export function StatusLine({ st, className = '' }: { st: ReturnType<typeof statusView>; className?: string }) {
  if (st.kind === 'live' || st.kind === 'break')
    return (
      <div className={cx('mt-1.5 flex items-center gap-1.5 text-[13px] font-bold tabular', st.kind === 'live' ? 'text-live' : 'text-warn', className)}>
        {st.kind === 'live' && <LiveDot />}
        <span>{st.main}</span>
        {st.sub && <span className="font-semibold text-white/55">· {st.sub}</span>}
      </div>
    );
  if (st.kind === 'scheduled') return <div className={cx('mt-1.5 text-[12px] font-semibold text-mute', className)}>{st.sub}</div>;
  return (
    <div className={cx('mt-1.5 text-[12px] font-bold uppercase tracking-wider', st.kind === 'final' ? 'text-white/60' : 'text-warn', className)}>
      {st.main}
      {st.sub && <span className="ml-1 font-semibold normal-case tracking-normal text-mute">· {st.sub}</span>}
    </div>
  );
}

function Team({ inst, dim, right, serving, batting }: { inst: InstitutionDTO; dim?: boolean; right?: boolean; serving?: boolean; batting?: boolean }) {
  return (
    <div className={cx('flex min-w-0 flex-col items-center gap-1.5 transition-opacity', dim && 'opacity-50')}>
      <div className="relative">
        <TeamFlag inst={inst} size={46} />
        {(serving || batting) && <span className={cx('absolute -bottom-0.5 h-3 w-3 rounded-full bg-brand ring-2 ring-ink-850', right ? '-left-0.5' : '-right-0.5')} title={serving ? 'Sacando' : 'Rebatendo'} />}
      </div>
      <span className="max-w-full truncate text-[14px] font-semibold leading-tight">{inst.name}</span>
    </div>
  );
}

function RankingBody({ m, inst }: { m: MatchSummary; inst: Map<string, InstitutionDTO> }) {
  const now = useNow(5000, m.status === 'LIVE');
  const st = statusView(m, now);
  const rows = m.score.ranking ?? [];
  const top = rows.filter((r) => r.position).slice(0, 3);
  const medal = ['#ffd60a', '#d1d5db', '#d0884f'];
  return (
    <div className="mt-2.5">
      <div className="flex items-center justify-between">
        <div className="font-display text-[24px] font-bold leading-none">{m.title ?? 'Prova'}</div>
        <div className="text-right">
          {st.kind === 'scheduled' ? <div className="font-display text-[22px] font-bold leading-none">{st.main}</div> : null}
          <StatusLine st={st} className="mt-0.5 justify-end" />
        </div>
      </div>
      {top.length ? (
        <div className="mt-3 space-y-1.5">
          {top.map((r) => {
            const i = inst.get(r.institutionId);
            return (
              <div key={r.participantId} className="flex items-center gap-2.5 text-[14px]">
                <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black text-coal" style={{ background: medal[(r.position ?? 1) - 1] ?? '#3a3d47' }}>
                  {r.position}
                </span>
                {i && <TeamFlag inst={i} size={22} />}
                <span className="truncate font-semibold">{i?.name}</span>
                <span className="truncate text-mute">{r.athleteName}</span>
                <span className="ml-auto font-display text-[17px] font-bold tabular">{r.result}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 flex -space-x-1.5">
          {(m.participantIds ?? []).slice(0, 8).map((id) => {
            const i = inst.get(id);
            return i ? <TeamFlag key={id} inst={i} size={26} className="rounded-full ring-2 ring-ink-850" /> : null;
          })}
          <span className="pl-3 text-[12px] text-mute">{rows.length} participantes</span>
        </div>
      )}
    </div>
  );
}

function Footer({ m }: { m: MatchSummary }) {
  if (m.status === 'LIVE' && m.lastEvent && m.lastEvent.type !== 'MATCH_START') {
    return (
      <div className="mt-3 flex items-center gap-2 border-t border-white/[0.05] pt-2.5 text-[12px] text-white/70">
        <TimelineIcon icon={iconForType(m.lastEvent.type)} size={13} />
        <span className="truncate">{m.lastEvent.label}</span>
      </div>
    );
  }
  if (m.status === 'SCHEDULED' && m.venue)
    return (
      <div className="mt-3 flex items-center justify-center gap-1 text-[12px] text-mute">
        <MapPin className="h-3 w-3" />
        {m.venue}
      </div>
    );
  return null;
}

const iconForType = (t: string) => (t === 'ACTION' ? 'goal' : t === 'POINT' ? 'point' : t === 'RUN' ? 'run' : t === 'OUT' ? 'out' : t === 'RESULT' ? 'result' : 'whistle');

// ---------------------------------------------------------------- flash de gol no card

function useCardFlash(id: string, focused: string | null, atleticaId: string | null) {
  const [flash, setFlash] = useState<{ h: Highlight; key: number } | null>(null);
  useEffect(
    () =>
      onHighlight(({ summary, highlight }) => {
        if (summary.id !== id) return;
        // a tela cheia já comemora esse: o card não anima junto (evita GOL! duplicado)
        if (celebratesFullscreen(summary, highlight, focused, atleticaId)) return;
        if (!['score', 'set', 'end', 'card', 'start', 'game'].includes(highlight.type)) return;
        if (highlight.type === 'score' && !highlight.big && (highlight.value ?? 1) < 2 && summary.score.tennis) return;
        setFlash({ h: highlight, key: Date.now() });
      }),
    [id, focused, atleticaId],
  );
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), flash.h.big ? 2800 : 1300);
    return () => clearTimeout(t);
  }, [flash]);
  return flash;
}

function CardFlash({ h, m, inst }: { h: Highlight; m: MatchSummary; inst: Map<string, InstitutionDTO> }) {
  const t = h.side ? teamsOf(m, inst)[h.side] : null;
  const color = t ? teamTone(t.primaryColor, t.secondaryColor) : h.type === 'card' ? '#e0261d' : '#111114';
  const left = h.side === 'home';
  if (!h.big && h.type === 'score') {
    return (
      <motion.div
        className="pointer-events-none absolute inset-0 z-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 1.2 }}
        style={{ background: `radial-gradient(120% 90% at ${left ? '15%' : h.side ? '85%' : '50%'} 55%, ${alpha(color, 0.35)}, transparent 60%)` }}
      />
    );
  }
  return (
    <motion.div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.4 } }}>
      <motion.div
        className="absolute inset-0"
        initial={{ x: left ? '-100%' : '100%' }}
        animate={{ x: '0%' }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        style={{ background: `linear-gradient(${left ? 100 : 260}deg, ${color} 0%, ${alpha(color, 0.92)} 55%, ${alpha(color, 0.75)} 100%)` }}
      />
      <motion.div className="relative text-center" initial={{ scale: 1.12, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.08, duration: 0.35, ease: [0.16, 1, 0.3, 1] }} style={{ color: onColor(color) }}>
        <div className="font-poster text-[54px] font-extrabold uppercase italic leading-none tracking-tight drop-shadow">{h.label}</div>
        <div className="mt-1 text-[13px] font-bold uppercase tracking-widest opacity-90">
          {[t?.name, h.athleteName].filter(Boolean).join(' · ')}
          {h.type === 'end' && `${fmtScore(m.score.home)} – ${fmtScore(m.score.away)}`}
        </div>
      </motion.div>
    </motion.div>
  );
}
