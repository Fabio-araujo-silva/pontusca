// "Quem fez?" — aparece embaixo logo depois de um lance (gol, cesta, ponto,
// cartão, substituição, rebatida…). O lance já valeu; escolher o autor é
// opcional e pode ficar pra depois, sem travar o próximo toque.
import { AnimatePresence, motion } from 'framer-motion';
import { Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { EngineEvent, InstitutionDTO, PlayerView, SportConfig } from '@shared/types';
import { authorSlots } from '@shared/engine';
import { TimelineIcon } from '@/components/match/TimelineIcon';
import { onField, shortName, teamColors } from './helpers';
import type { Who } from './useConsole';

export function eventTitle(ev: EngineEvent) {
  switch (ev.type) {
    case 'ACTION':
      return ev.payload?.short ?? ev.payload?.label ?? 'Lance';
    case 'SHOOTOUT_KICK':
      return ev.payload?.scored ? 'Pênalti convertido' : 'Pênalti perdido';
    case 'HIT':
      return 'Rebatida';
    case 'RUN':
      return 'Corrida';
    default:
      return 'Lance';
  }
}

export function eventIcon(ev: EngineEvent) {
  if (ev.type === 'ACTION') {
    const k = ev.payload?.kind;
    if (k === 'card') return `card-${ev.payload?.color ?? 'yellow'}`;
    if (k === 'sub') return 'sub';
    return ev.payload?.against ? 'own-goal' : 'goal';
  }
  if (ev.type === 'SHOOTOUT_KICK') return ev.payload?.scored ? 'pen-goal' : 'pen-miss';
  if (ev.type === 'HIT') return 'hit';
  return 'run';
}

export function AuthorBar({
  ev,
  cfg,
  lineups,
  events,
  home,
  away,
  sportIcon,
  onAssign,
  onMore,
  onClose,
}: {
  ev: EngineEvent | null;
  cfg: SportConfig;
  lineups: { home: PlayerView[]; away: PlayerView[] };
  events: EngineEvent[];
  home: InstitutionDTO | null;
  away: InstitutionDTO | null;
  sportIcon: string;
  onAssign: (who: Who) => void;
  onMore: (step: 1 | 2) => void;
  onClose: () => void;
}) {
  const sub = !!ev && authorSlots(ev, cfg) === 2;
  // substituição: passo 1 = quem sai, passo 2 = quem entra
  const step: 1 | 2 = sub && ev?.athleteId && !ev.athlete2Id ? 2 : 1;
  const side = ev?.side ?? null;
  const c = teamColors(side === 'away' ? away : home);
  const [shownFor, setShownFor] = useState<string | null>(null);

  // some sozinha depois de um tempo parada; o lance continua em "Sem autor"
  useEffect(() => {
    if (!ev) return;
    setShownFor(ev.id);
    const t = setTimeout(onClose, 14000);
    return () => clearTimeout(t);
  }, [ev?.id, step]); // eslint-disable-line react-hooks/exhaustive-deps

  const players = useMemo(() => {
    if (!side) return [];
    const list = lineups[side];
    const field = onField(list, events, side);
    const inPlay = (p: PlayerView) => field.has(p.athleteId);
    const ordered = [...list].sort((a, b) => Number(inPlay(b)) - Number(inPlay(a)) || (a.number ?? 999) - (b.number ?? 999));
    // quem entra numa substituição vem do banco
    return sub && step === 2 ? [...ordered.filter((p) => !inPlay(p)), ...ordered.filter(inPlay)] : ordered;
  }, [lineups, events, side, sub, step]);

  const question = sub ? (step === 1 ? 'quem saiu?' : 'quem entrou?') : ev?.type === 'ACTION' && ev.payload?.kind === 'card' ? 'pra quem?' : 'quem fez?';

  return (
    <AnimatePresence>
      {ev && side && shownFor === ev.id && (
        <motion.div
          key={ev.id + step}
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-w-3xl px-2"
        >
          <div className="overflow-hidden rounded-t-[22px] bg-ink-850 shadow-glow ring-1 ring-white/[0.08]">
            <div className="h-1" style={{ background: c.bg }} />
            <div className="flex items-center gap-2.5 px-4 pb-2 pt-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06]">
                <TimelineIcon icon={eventIcon(ev)} sportIcon={sportIcon} size={16} />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[15px] font-bold">
                  {eventTitle(ev)} · {c.inst.name}
                </div>
                <div className="text-[12px] font-medium text-mute">Valeu! Agora, {question}</div>
              </div>
              <button onClick={onClose} className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-mute active:bg-white/[0.06]">
                Depois
              </button>
              <button onClick={onClose} aria-label="Fechar" className="-mr-1 rounded-full p-1.5 text-mute active:bg-white/[0.06]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="scroll-x gap-2 px-4 pb-3">
              {players.map((p) => (
                <button
                  key={p.athleteId}
                  onClick={() => onAssign(sub ? (step === 1 ? { athleteId: p.athleteId } : { athlete2Id: p.athleteId }) : { athleteId: p.athleteId })}
                  className="flex w-[68px] shrink-0 flex-col items-center gap-1 rounded-2xl py-1.5 active:scale-95 active:bg-white/[0.05]"
                  style={{ touchAction: 'manipulation' }}
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl font-display text-[22px] font-bold" style={{ background: c.bg, color: c.fg }}>
                    {p.number ?? '–'}
                  </span>
                  <span className="w-full truncate text-center text-[11px] font-semibold">{p.nickname || shortName(p.name)}</span>
                </button>
              ))}
              <button onClick={() => onMore(step)} className="flex w-[68px] shrink-0 flex-col items-center gap-1 rounded-2xl py-1.5 active:scale-95">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-dashed border-white/25 text-mute">
                  <Users className="h-5 w-5" />
                </span>
                <span className="text-[11px] font-semibold text-mute">{players.length ? 'Outro…' : 'Escalar'}</span>
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
