import { memo } from 'react';
import { EngineOutput, formatClock } from '@shared/engine';
import type { ClockView, InstitutionDTO, SportConfig } from '@shared/types';
import { LiveDot, ScoreNumber } from '@/components/ui/primitives';
import { TeamFlag } from '@/components/ui/TeamFlag';
import { alpha, fmtScore } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { teamColors } from './helpers';

export function ClockText({ clock, className = '' }: { clock: ClockView; className?: string }) {
  const now = useNow(250, clock.running);
  return <span className={`tabular ${className}`}>{formatClock(clock, now)}</span>;
}

function TeamCol({ inst, align }: { inst: InstitutionDTO | null; align: 'left' | 'right' }) {
  const c = teamColors(inst);
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <TeamFlag inst={c.inst} size={34} />
      <div className="min-w-0">
        <div className="truncate font-display text-[19px] font-bold leading-none uppercase">{c.inst.name}</div>
        <div className="mt-1 h-1 w-8 rounded-full" style={{ background: c.tone, marginLeft: align === 'right' ? 'auto' : 0 }} />
      </div>
    </div>
  );
}

export const Scoreboard = memo(function Scoreboard({ out, cfg, home, away, title }: { out: EngineOutput; cfg: SportConfig; home: InstitutionDTO | null; away: InstitutionDTO | null; title?: string | null }) {
  const L = out.live;
  const S = out.score;
  const live = out.status === 'LIVE';
  const hc = teamColors(home);
  const ac = teamColors(away);
  const ranking = cfg.engine === 'RANKING';

  return (
    <div
      className="relative overflow-hidden rounded-[24px] px-4 pb-3 pt-3 ring-1 ring-white/[0.07]"
      style={{ background: ranking ? 'rgb(var(--ink-850))' : `linear-gradient(100deg, ${alpha(hc.tone, 0.14)} 0%, rgb(var(--ink-850)) 36%, rgb(var(--ink-850)) 64%, ${alpha(ac.tone, 0.14)} 100%)` }}
    >
      <div className="mb-2 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
        {live && <LiveDot />}
        <span>{L.periodLabel}</span>
        {L.clock && (L.phase === 'PERIOD' || L.phase === 'BREAK') && (
          <span className={`rounded-md px-1.5 py-0.5 font-display text-[15px] tracking-normal ${L.clock.running ? 'bg-live/15 text-live' : 'bg-white/10 text-white'}`}>
            <ClockText clock={L.clock} />
          </span>
        )}
      </div>

      {ranking ? (
        <div className="text-center font-display text-[26px] font-bold leading-tight uppercase">{title || 'Prova'}</div>
      ) : (
        <div className="flex items-center gap-2">
          <TeamCol inst={home} align="left" />
          <div className="flex shrink-0 items-center gap-2 font-display text-[52px] font-extrabold leading-none uppercase">
            <ScoreNumber value={S.home} dim={out.winner === 'away'} />
            <span className="text-[28px] text-white/30">–</span>
            <ScoreNumber value={S.away} dim={out.winner === 'home'} />
          </div>
          <TeamCol inst={away} align="right" />
        </div>
      )}

      {/* detalhes por motor */}
      {S.tennis && L.phase === 'PERIOD' && (
        <div className="mt-2 flex items-center justify-center gap-6 font-display text-[22px] font-bold uppercase">
          <span className="flex items-center gap-1.5">
            {S.tennis.server === 'home' && <span className="h-2 w-2 rounded-full bg-brand" />}
            {S.tennis.game[0]}
          </span>
          <span className="text-[11px] font-sans font-semibold uppercase tracking-widest text-mute">{S.tennis.tiebreak ? 'tie-break' : 'game'}</span>
          <span className="flex items-center gap-1.5">
            {S.tennis.game[1]}
            {S.tennis.server === 'away' && <span className="h-2 w-2 rounded-full bg-brand" />}
          </span>
        </div>
      )}
      {S.periods.length > 0 && !ranking && (
        <div className="scroll-x mt-2 justify-center gap-1.5">
          {S.periods.map(([h, a], i) => {
            const current = i === S.periods.length - 1 && L.phase === 'PERIOD';
            return (
              <span key={i} className={`shrink-0 rounded-lg px-2 py-0.5 text-[12px] font-semibold tabular ${current ? 'bg-white text-black' : 'bg-white/[0.07] text-white/70'}`}>
                {fmtScore(h)}-{fmtScore(a)}
              </span>
            );
          })}
        </div>
      )}
      {S.shootout && (
        <div className="mt-2 text-center text-[12px] font-bold uppercase tracking-wider text-brand">
          {cfg.shootout?.label ?? 'Pênaltis'}: {S.shootout.home} – {S.shootout.away}
        </div>
      )}
      {(S.fouls?.home || S.fouls?.away || S.timeouts?.home || S.timeouts?.away) && L.phase !== 'END' ? (
        <div className="mt-2 flex justify-between text-[11px] font-semibold uppercase tracking-wider text-mute">
          <span>
            {S.fouls ? `${S.fouls.home} falta${S.fouls.home === 1 ? '' : 's'}` : ''} {S.timeouts?.home ? `· ${S.timeouts.home} tempo${S.timeouts.home > 1 ? 's' : ''}` : ''}
          </span>
          <span>
            {S.timeouts?.away ? `${S.timeouts.away} tempo${S.timeouts.away > 1 ? 's' : ''} · ` : ''}
            {S.fouls ? `${S.fouls.away} falta${S.fouls.away === 1 ? '' : 's'}` : ''}
          </span>
        </div>
      ) : null}
    </div>
  );
});
