// Painel do motor SCORE (futebol, basquete, handebol, lutas, xadrez...).
import { ArrowDownUp, BarChart3, Check, Hand, PauseCircle, X } from 'lucide-react';
import { useMemo } from 'react';
import type { Side, SportAction } from '@shared/types';
import { cx } from '@/components/ui/primitives';
import { SportIcon } from '@/components/ui/SportIcon';
import { alpha } from '@/lib/format';
import type { PanelCtx } from './ctx';
import { onField, SIDES, teamColors } from './helpers';
import { CardGlyph } from './icons';

export function useActionCounts(ctx: PanelCtx) {
  return useMemo(() => {
    const m = new Map<string, number>();
    for (const e of ctx.events) if (e.type === 'ACTION' && e.side) m.set(`${e.side}:${e.payload?.key}`, (m.get(`${e.side}:${e.payload?.key}`) ?? 0) + 1);
    return m;
  }, [ctx.events]);
}

/** Pede atleta(s) conforme a ação e registra. */
export async function runAction(ctx: PanelCtx, side: Side, a: SportAction) {
  const lineup = ctx.detail.lineups[side];
  let athleteId: string | null = null;
  let athlete2Id: string | null = null;
  if (a.kind === 'sub') {
    const field = onField(lineup, ctx.events, side);
    const bench = new Set(lineup.filter((p) => !field.has(p.athleteId)).map((p) => p.athleteId));
    const out = await ctx.pickAthlete(side, { title: 'Substituição · quem SAI?', optional: true, preferred: field, preferredLabel: 'Em quadra', otherLabel: 'Banco' });
    if (out === undefined) return;
    const inn = await ctx.pickAthlete(side, { title: 'Substituição · quem ENTRA?', optional: true, preferred: bench, preferredLabel: 'Banco', otherLabel: 'Em quadra' });
    if (inn === undefined) return;
    athleteId = out;
    athlete2Id = inn;
  } else if (a.athlete && a.athlete !== 'none' && (lineup.length || a.athlete === 'required')) {
    const field = onField(lineup, ctx.events, side);
    const r = await ctx.pickAthlete(side, {
      title: `${a.short ?? a.label} — de quem?`,
      subtitle: a.against ? 'Gol contra: conta pro adversário' : undefined,
      optional: a.athlete === 'optional',
      preferred: field.size ? field : undefined,
      preferredLabel: 'Em quadra',
      otherLabel: 'Banco',
    });
    if (r === undefined) return;
    athleteId = r;
  }
  ctx.send({ type: 'ACTION', side, athleteId, athlete2Id, payload: { action: a.key } });
}

function SecondaryIcon({ a }: { a: SportAction }) {
  if (a.kind === 'card') return <CardGlyph color={a.color} />;
  if (a.kind === 'sub') return <ArrowDownUp className="h-4 w-4 text-win" />;
  if (a.kind === 'foul') return <Hand className="h-4 w-4 text-warn" />;
  if (a.kind === 'timeout') return <PauseCircle className="h-4 w-4 text-white/70" />;
  if (a.kind === 'score') return <span className="text-[11px] font-bold text-live">−</span>;
  return <BarChart3 className="h-4 w-4 text-white/60" />;
}

function SideColumn({ ctx, side, counts }: { ctx: PanelCtx; side: Side; counts: Map<string, number> }) {
  const inst = side === 'home' ? ctx.home : ctx.away;
  const c = teamColors(inst);
  const phase = ctx.out.live.phase;
  const canScore = !ctx.disabled && phase === 'PERIOD';
  const canOther = !ctx.disabled && (phase === 'PERIOD' || phase === 'BREAK');
  const scoreActs = ctx.cfg.actions.filter((a) => a.kind === 'score' && !a.against);
  const otherActs = ctx.cfg.actions.filter((a) => !(a.kind === 'score' && !a.against));
  const many = scoreActs.length > 3;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.tone }} />
        <span className="truncate font-display text-[17px] font-bold uppercase tracking-wide">{c.inst.name}</span>
      </div>
      <div className={cx('grid gap-2', many ? 'grid-cols-2' : 'grid-cols-1')}>
        {scoreActs.map((a, i) => {
          const single = scoreActs.length === 1;
          const allShort = scoreActs.every((x) => x.label.length <= 4);
          const label = a.key === 'goal' ? 'GOL' : a.label;
          const size = many
            ? 'h-16 px-1 text-[17px]'
            : single
              ? 'h-32 text-[44px]'
              : allShort
                ? 'h-[72px] text-[34px]'
                : i === 0
                  ? 'h-24 text-[38px]'
                  : 'h-14 px-2 text-[17px]';
          const n = counts.get(`${side}:${a.key}`) ?? 0;
          return (
            <button
              key={a.key}
              disabled={!canScore}
              onClick={() => void runAction(ctx, side, a)}
              className={cx(
                'relative flex flex-col items-center justify-center overflow-hidden rounded-2xl text-center font-display font-extrabold uppercase leading-none shadow-card transition active:scale-[0.96] disabled:opacity-35',
                size,
                a.decisive && 'ring-2 ring-white/70',
              )}
              style={{ background: i === 0 || !many ? c.bg : alpha(c.bg, 0.8), color: c.fg, touchAction: 'manipulation' }}
            >
              {single && <SportIcon name={ctx.sportIcon} size={24} className="mb-1.5 opacity-70" />}
              {label}
              {n > 0 && !single && <span className="absolute right-2 top-1.5 font-sans text-[10px] font-bold opacity-60">{n}</span>}
            </button>
          );
        })}
      </div>
      {otherActs.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {otherActs.map((a) => {
            const n = counts.get(`${side}:${a.key}`) ?? 0;
            return (
              <button
                key={a.key}
                disabled={!canOther}
                onClick={() => void runAction(ctx, side, a)}
                className="relative flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-xl bg-white/[0.06] px-1.5 text-[12.5px] font-semibold ring-1 ring-white/[0.08] transition active:scale-95 active:bg-white/[0.12] disabled:opacity-35"
                style={{ touchAction: 'manipulation' }}
              >
                <SecondaryIcon a={a} />
                <span className="truncate">{a.label}</span>
                {n > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-black">{n}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Shootout({ ctx }: { ctx: PanelCtx }) {
  const so = ctx.out.score.shootout;
  const kicks = so?.kicks ?? [];
  const nextSide: Side = kicks.length % 2 === 0 ? 'home' : 'away';
  return (
    <div className="grid grid-cols-2 gap-2">
      {SIDES.map((side) => {
        const c = teamColors(side === 'home' ? ctx.home : ctx.away);
        const mine = kicks.filter((k) => k.side === side);
        return (
          <div key={side} className={cx('rounded-2xl p-2 ring-2', nextSide === side ? 'ring-brand' : 'ring-transparent')} style={{ background: alpha(c.bg, 0.16) }}>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="truncate font-display text-[17px] font-bold uppercase">{c.inst.name}</span>
              <span className="font-display text-[28px] font-extrabold">{so?.[side] ?? 0}</span>
            </div>
            <div className="mb-2 flex min-h-[18px] flex-wrap gap-1 px-1">
              {mine.map((k, i) => (
                <span key={i} className={cx('h-4 w-4 rounded-full', k.scored ? 'bg-win' : 'bg-live')} />
              ))}
            </div>
            {nextSide === side && <p className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wider text-brand">Próxima cobrança</p>}
            <div className="grid gap-1.5">
              <button disabled={ctx.disabled} onClick={() => ctx.send({ type: 'SHOOTOUT_KICK', side, payload: { scored: true } })} className="flex h-16 items-center justify-center gap-2 rounded-xl bg-win text-[16px] font-bold text-black active:scale-95 disabled:opacity-40">
                <Check className="h-5 w-5" /> Converteu
              </button>
              <button disabled={ctx.disabled} onClick={() => ctx.send({ type: 'SHOOTOUT_KICK', side, payload: { scored: false } })} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-live/90 text-[15px] font-bold text-white active:scale-95 disabled:opacity-40">
                <X className="h-5 w-5" /> Perdeu
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ScorePanel({ ctx }: { ctx: PanelCtx }) {
  const counts = useActionCounts(ctx);
  if (ctx.out.live.phase === 'SHOOTOUT') return <Shootout ctx={ctx} />;
  return (
    <div className="grid grid-cols-2 gap-3">
      {SIDES.map((s) => (
        <SideColumn key={s} ctx={ctx} side={s} counts={counts} />
      ))}
    </div>
  );
}
