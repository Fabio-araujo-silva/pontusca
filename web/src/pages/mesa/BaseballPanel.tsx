// Painel do motor BASEBALL (beisebol, softbol).
import type { ReactNode } from 'react';
import type { BaseballView, Side } from '@shared/types';
import { cx } from '@/components/ui/primitives';
import { alpha } from '@/lib/format';
import type { PanelCtx } from './ctx';
import { teamColors } from './helpers';

function Dots({ n, of, color, label }: { n: number; of: number; color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-4 font-display text-[18px] font-bold text-mute">{label}</span>
      <div className="flex gap-1.5">
        {Array.from({ length: of }, (_, i) => (
          <span key={i} className="h-4 w-4 rounded-full ring-1 ring-white/20" style={{ background: i < n ? color : 'transparent' }} />
        ))}
      </div>
    </div>
  );
}

function Diamond({ bases, onToggle, disabled }: { bases: [boolean, boolean, boolean]; onToggle: (i: number) => void; disabled: boolean }) {
  // posições: 2ª em cima, 3ª à esquerda, 1ª à direita
  const pos = [
    { i: 0, x: 72, y: 46 },
    { i: 1, x: 46, y: 20 },
    { i: 2, x: 20, y: 46 },
  ];
  return (
    <svg viewBox="0 0 92 84" className="h-[124px] w-[136px]">
      <path d="M46 76 L76 46 L46 16 L16 46 Z" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="1.5" />
      <rect x="40" y="70" width="12" height="12" transform="rotate(45 46 76)" fill="rgba(255,255,255,.35)" />
      {pos.map((p) => (
        <g key={p.i} onClick={() => !disabled && onToggle(p.i)} style={{ cursor: disabled ? 'default' : 'pointer' }}>
          <rect x={p.x - 13} y={p.y - 13} width="26" height="26" fill="transparent" />
          <rect x={p.x - 9} y={p.y - 9} width="18" height="18" rx="2.5" transform={`rotate(45 ${p.x} ${p.y})`} fill={bases[p.i] ? '#d7ff3e' : 'rgba(255,255,255,.08)'} stroke="rgba(255,255,255,.35)" strokeWidth="1.2" />
        </g>
      ))}
    </svg>
  );
}

function Key({ children, onClick, disabled, tone = 'soft', className = '' }: { children: ReactNode; onClick: () => void; disabled: boolean; tone?: 'soft' | 'red' | 'brand' | 'team'; className?: string }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex h-14 items-center justify-center rounded-2xl text-[15px] font-bold transition active:scale-95 disabled:opacity-35',
        tone === 'soft' && 'bg-white/[0.07] ring-1 ring-white/10',
        tone === 'red' && 'bg-live text-white',
        tone === 'brand' && 'bg-brand text-brand-ink',
        className,
      )}
      style={{ touchAction: 'manipulation' }}
    >
      {children}
    </button>
  );
}

export function BaseballPanel({ ctx }: { ctx: PanelCtx }) {
  const B = ctx.out.score.baseball as BaseballView | undefined;
  const L = ctx.out.live;
  const dis = ctx.disabled || L.phase !== 'PERIOD' || L.suggestEnd;
  if (!B) return null;
  const batting: Side = B.half === 'top' ? 'away' : 'home';
  const bc = teamColors(batting === 'home' ? ctx.home : ctx.away);
  const innings = Math.max(ctx.cfg.baseball?.innings ?? 9, B.innings.away.length, B.innings.home.length);

  const toggle = (i: number) => {
    const nb = [...B.bases] as [boolean, boolean, boolean];
    nb[i] = !nb[i];
    ctx.send({ type: 'BASES', payload: { bases: nb } });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ring-1 ring-white/[0.07]" style={{ background: alpha(bc.bg, 0.18) }}>
        <div className="space-y-2">
          <div className="text-[12px] font-bold uppercase tracking-widest text-white/70">
            {B.half === 'top' ? '▲' : '▼'} {B.inning}ª · rebatendo <span style={{ color: bc.tone }}>{bc.inst.name}</span>
          </div>
          <Dots n={B.balls} of={4} color="#30d158" label="B" />
          <Dots n={B.strikes} of={3} color="#ffd60a" label="S" />
          <Dots n={B.outs} of={3} color="#ff3b30" label="O" />
        </div>
        <Diamond bases={B.bases} onToggle={toggle} disabled={dis} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Key disabled={dis} onClick={() => ctx.send({ type: 'PITCH', payload: { result: 'BALL' } })}>Bola</Key>
        <Key disabled={dis} onClick={() => ctx.send({ type: 'PITCH', payload: { result: 'STRIKE' } })}>Strike</Key>
        <Key disabled={dis} onClick={() => ctx.send({ type: 'PITCH', payload: { result: 'FOUL' } })}>Foul</Key>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {(['1B', '2B', '3B', 'HR'] as const).map((k) => (
          <Key key={k} disabled={dis} tone={k === 'HR' ? 'brand' : 'soft'} onClick={() => ctx.send({ type: 'HIT', payload: { kind: k } })}>
            {k === 'HR' ? 'HR' : k}
          </Key>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Key disabled={dis} tone="red" onClick={() => ctx.send({ type: 'OUT' })}>
          Out
        </Key>
        <button
          disabled={dis}
          onClick={() => ctx.send({ type: 'RUN' })}
          className="flex h-14 items-center justify-center rounded-2xl text-[15px] font-bold active:scale-95 disabled:opacity-35"
          style={{ background: bc.bg, color: bc.fg }}
        >
          Corrida +1
        </button>
        <Key disabled={dis} onClick={() => ctx.send({ type: 'ERROR' })}>
          Erro
        </Key>
      </div>
      <p className="text-center text-[11px] text-mute">Rebatidas avançam os corredores automaticamente; ajuste tocando nas bases e use “Corrida +1” quando precisar.</p>

      <div className="overflow-x-auto rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.06]">
        <table className="w-full text-center text-[13px] tabular">
          <thead className="text-[11px] text-mute">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold"> </th>
              {Array.from({ length: innings }, (_, i) => (
                <th key={i} className={cx('px-1 font-semibold', i + 1 === B.inning && 'text-white')}>
                  {i + 1}
                </th>
              ))}
              <th className="px-1.5 font-bold text-white">R</th>
              <th className="px-1.5 font-semibold">H</th>
              <th className="px-1.5 font-semibold">E</th>
            </tr>
          </thead>
          <tbody>
            {(['away', 'home'] as const).map((s) => {
              const c = teamColors(s === 'home' ? ctx.home : ctx.away);
              return (
                <tr key={s} className="border-t border-white/[0.06]">
                  <td className="max-w-[90px] truncate px-2 py-1.5 text-left font-semibold">{c.inst.name}</td>
                  {Array.from({ length: innings }, (_, i) => (
                    <td key={i} className="px-1 text-white/80">
                      {B.innings[s][i] ?? ''}
                    </td>
                  ))}
                  <td className="px-1.5 font-display text-[16px] font-bold">{ctx.out.score[s]}</td>
                  <td className="px-1.5">{B.hits[s]}</td>
                  <td className="px-1.5">{B.errors[s]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
