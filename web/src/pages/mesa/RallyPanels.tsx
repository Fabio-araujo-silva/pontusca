// Painéis de "ponto a ponto": SETS (vôlei, tênis de mesa, e-sports) e TENNIS.
import { useState } from 'react';
import type { Side } from '@shared/types';
import { Confirm, cx } from '@/components/ui/primitives';
import { alpha, fmtScore } from '@/lib/format';
import type { PanelCtx } from './ctx';
import { SIDES, teamColors } from './helpers';
import { runAction, useActionCounts } from './ScorePanel';
import { CardGlyph } from './icons';

function BigPoint({ ctx, side, value, label, sub, onPress, dim }: { ctx: PanelCtx; side: Side; value: string; label: string; sub?: string; onPress: () => void; dim?: boolean }) {
  const c = teamColors(side === 'home' ? ctx.home : ctx.away);
  return (
    <button
      disabled={ctx.disabled || dim}
      onClick={onPress}
      className="relative flex h-[min(42vh,320px)] min-h-[190px] flex-col items-center justify-center overflow-hidden rounded-[26px] shadow-card transition active:scale-[0.97] disabled:opacity-35"
      style={{ background: `linear-gradient(160deg, ${c.bg}, ${alpha(c.bg, 0.78)})`, color: c.fg, touchAction: 'manipulation' }}
    >
      <span className="absolute left-3 top-3 max-w-[80%] truncate font-display text-[16px] font-bold uppercase tracking-wide opacity-90">{c.inst.name}</span>
      <span className="font-display text-[96px] font-extrabold leading-none tabular">{value}</span>
      <span className="mt-2 rounded-full px-4 py-1 text-[15px] font-bold" style={{ background: alpha(c.fg, 0.16) }}>
        {label}
      </span>
      {sub && <span className="absolute bottom-3 text-[11px] font-semibold uppercase tracking-widest opacity-70">{sub}</span>}
    </button>
  );
}

function ExtraActions({ ctx }: { ctx: PanelCtx }) {
  const counts = useActionCounts(ctx);
  if (!ctx.cfg.actions.length) return null;
  const can = !ctx.disabled && (ctx.out.live.phase === 'PERIOD' || ctx.out.live.phase === 'BREAK');
  return (
    <div className="mt-3 grid grid-cols-2 gap-3">
      {SIDES.map((side) => (
        <div key={side} className="grid grid-cols-2 gap-1.5">
          {ctx.cfg.actions.map((a) => {
            const n = counts.get(`${side}:${a.key}`) ?? 0;
            return (
              <button key={a.key} disabled={!can} onClick={() => void runAction(ctx, side, a)} className="relative flex h-11 items-center justify-center gap-1.5 rounded-xl bg-white/[0.06] px-1 text-[12px] font-semibold ring-1 ring-white/[0.08] active:scale-95 disabled:opacity-35">
                {a.kind === 'card' && <CardGlyph color={a.color} size={14} />}
                <span className="truncate">{a.label}</span>
                {n > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-black">{n}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function SetsPanel({ ctx }: { ctx: PanelCtx }) {
  const S = ctx.cfg.sets!;
  const L = ctx.out.live;
  const cur = ctx.out.score.periods[ctx.out.score.periods.length - 1] ?? [0, 0];
  const [winSide, setWinSide] = useState<Side | null>(null);
  const live = L.phase === 'PERIOD' || L.phase === 'BREAK';
  const blocked = !live || L.suggestEnd;
  const between = L.phase === 'BREAK' && !L.suggestEnd;
  const label = S.label.toLowerCase();

  return (
    <div>
      {between && <p className="mb-2 text-center text-[13px] font-semibold text-brand">Toque em +1 para começar o {label} {L.period + 1}</p>}
      <div className="grid grid-cols-2 gap-3">
        {SIDES.map((side, i) =>
          S.target == null ? (
            <BigPoint key={side} ctx={ctx} side={side} value={String(ctx.out.score[side])} label={`Venceu o ${label}`} sub={`${S.label}s vencidos`} dim={blocked} onPress={() => setWinSide(side)} />
          ) : (
            <BigPoint
              key={side}
              ctx={ctx}
              side={side}
              value={between ? '0' : fmtScore(cur[i])}
              label="+1 ponto"
              sub={`${S.label} ${between ? L.period + 1 : L.period} · ${ctx.out.score[side]} vencidos`}
              dim={blocked}
              onPress={() => ctx.send({ type: 'POINT', side })}
            />
          ),
        )}
      </div>
      <ExtraActions ctx={ctx} />
      <Confirm
        open={!!winSide}
        onClose={() => setWinSide(null)}
        title={`${S.label} para ${winSide ? teamColors(winSide === 'home' ? ctx.home : ctx.away).inst.name : ''}?`}
        confirmLabel={`Confirmar ${label}`}
        onConfirm={() => {
          if (winSide) ctx.send({ type: 'SET_WIN', side: winSide });
          setWinSide(null);
        }}
      >
        Marca o {label} {L.phase === 'BREAK' ? L.period + 1 : L.period} como vencido. Dá pra desfazer na timeline.
      </Confirm>
    </div>
  );
}

export function TennisPanel({ ctx }: { ctx: PanelCtx }) {
  const T = ctx.out.score.tennis;
  const L = ctx.out.live;
  const blocked = L.phase !== 'PERIOD' || L.suggestEnd;
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {SIDES.map((side, i) => (
          <BigPoint
            key={side}
            ctx={ctx}
            side={side}
            value={T && L.phase === 'PERIOD' ? T.game[i] || '0' : '–'}
            label="Ponto"
            sub={T?.server === side ? '● no saque' : T?.tiebreak ? 'tie-break' : undefined}
            dim={blocked}
            onPress={() => ctx.send({ type: 'POINT', side })}
          />
        ))}
      </div>
      {T && T.sets.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.06]">
          {SIDES.map((side, i) => {
            const c = teamColors(side === 'home' ? ctx.home : ctx.away);
            return (
              <div key={side} className={cx('flex items-center gap-3 px-3 py-2', i === 0 && 'border-b border-white/[0.06]')}>
                <span className="h-2 w-2 rounded-full" style={{ background: c.tone }} />
                <span className="flex-1 truncate text-[14px] font-semibold">{c.inst.name}</span>
                {T.sets.map((s, k) => (
                  <span key={k} className="w-7 text-center font-display text-[20px] font-bold tabular">
                    {s[i]}
                    {T.tiebreaks[k] && <sup className="ml-0.5 text-[10px] text-mute">{T.tiebreaks[k]![i]}</sup>}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
