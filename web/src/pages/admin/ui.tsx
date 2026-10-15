// Peças de formulário e listagem reaproveitadas pelas telas do painel.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MatchSummary } from '@shared/types';
import { cx, LiveBadge, toast } from '@/components/ui/primitives';
import { SportIcon } from '@/components/ui/SportIcon';
import { TeamFlag } from '@/components/ui/TeamFlag';
import { formatClock } from '@shared/engine/common';
import { fmtScore, GENDER, TZ } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { useAdmin } from './ctx';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-[34px] font-extrabold uppercase leading-none tracking-tight">{title}</h1>
        {subtitle && <div className="mt-1.5 text-[13px] text-mute">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-mute-2">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 rounded-xl bg-ink-800 px-3.5 py-2.5 text-left ring-1 ring-white/10">
      <span>
        <span className="block text-[14px] font-medium">{label}</span>
        {hint && <span className="block text-[12px] text-mute">{hint}</span>}
      </span>
      <span className={cx('relative h-6 w-10 shrink-0 rounded-full transition', checked ? 'bg-brand' : 'bg-white/15')}>
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[18px] bg-brand-ink' : 'left-0.5')} style={checked ? { background: '#0a0b00' } : undefined} />
      </span>
    </button>
  );
}

export function Select({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cx('field appearance-none bg-[length:12px] pr-8', className)}>
      {children}
    </select>
  );
}

export function NumInput({ value, onChange, step = 1, min, max, className, placeholder }: { value: number | null | undefined; onChange: (v: number | null) => void; step?: number; min?: number; max?: number; className?: string; placeholder?: string }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      className={cx('field tabular', className)}
      value={value ?? ''}
      step={step}
      min={min}
      max={max}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    />
  );
}

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} className="h-11 w-12 shrink-0 cursor-pointer rounded-xl border-0 bg-transparent p-0" />
      <input className="field font-mono uppercase" value={value} maxLength={7} onChange={(e) => onChange(e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`)} />
    </div>
  );
}

/** Botões ↑↓ para reordenar listas (critérios de desempate, ações...). */
export function MoveButtons({ index, length, onMove }: { index: number; length: number; onMove: (from: number, to: number) => void }) {
  return (
    <span className="inline-flex gap-1">
      <button type="button" disabled={index === 0} onClick={() => onMove(index, index - 1)} className="rounded-lg p-1.5 text-mute hover:bg-white/10 hover:text-white disabled:opacity-25" aria-label="Subir">
        <ArrowUp className="h-4 w-4" />
      </button>
      <button type="button" disabled={index === length - 1} onClick={() => onMove(index, index + 1)} className="rounded-lg p-1.5 text-mute hover:bg-white/10 hover:text-white disabled:opacity-25" aria-label="Descer">
        <ArrowDown className="h-4 w-4" />
      </button>
    </span>
  );
}

export const move = <T,>(arr: T[], from: number, to: number) => {
  const a = arr.slice();
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x);
  return a;
};

export function Chip({ active, onClick, children, className }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition', active ? 'bg-white text-black' : 'bg-white/[0.06] text-white/75 hover:bg-white/[0.1]', className)}
    >
      {children}
    </button>
  );
}

export function SandboxBadge() {
  return <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">sandbox</span>;
}

const STATUS_STYLE: Record<string, string> = {
  SCHEDULED: 'bg-white/[0.07] text-white/70',
  FINISHED: 'bg-white/[0.07] text-white/50',
  POSTPONED: 'bg-amber-400/15 text-amber-300',
  CANCELED: 'bg-live/15 text-live',
};
const STATUS_TEXT: Record<string, string> = { SCHEDULED: 'Agendado', FINISHED: 'Encerrado', POSTPONED: 'Adiado', CANCELED: 'Cancelado' };

export function StatusPill({ m }: { m: MatchSummary }) {
  const now = useNow(1000, m.status === 'LIVE' && !!m.live.clock?.running);
  if (m.status === 'LIVE') return <LiveBadge>{m.live.clock ? `${m.live.shortLabel} ${formatClock(m.live.clock, now)}` : m.live.shortLabel || 'Ao vivo'}</LiveBadge>;
  return <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide', STATUS_STYLE[m.status])}>{STATUS_TEXT[m.status]}</span>;
}

/** Linha compacta com bandeiras e placar de um jogo. */
export function MatchLine({ m, compact }: { m: MatchSummary; compact?: boolean }) {
  const { inst, sport } = useAdmin();
  const s = sport(m.sportId);
  const h = inst(m.homeId);
  const a = inst(m.awayId);
  const showScore = m.status === 'LIVE' || m.status === 'FINISHED';
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/80">
        <SportIcon name={s?.icon} size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-mute">
          {s?.name ?? 'Modalidade'} · {GENDER[m.gender]}
          {m.phase ? ` · ${m.phase}` : ''}
          {m.group ? ` ${m.group}` : ''}
        </div>
        {m.title || !h || !a ? (
          <div className="truncate text-[14px] font-semibold">{m.title ?? 'Prova'} {m.participantIds ? <span className="text-mute">· {m.participantIds.length} atléticas</span> : null}</div>
        ) : (
          <div className={cx('flex items-center gap-2 text-[14px] font-semibold', compact && 'text-[13px]')}>
            <TeamFlag inst={h} size={20} />
            <span className={cx('truncate', m.winner === 'away' && 'text-white/50')}>{h.name}</span>
            {showScore ? (
              <span className="tabular shrink-0 font-display text-[17px] font-bold">
                {fmtScore(m.score.home)}
                <span className="mx-1 text-white/30">–</span>
                {fmtScore(m.score.away)}
              </span>
            ) : (
              <span className="text-white/30">×</span>
            )}
            <span className={cx('truncate', m.winner === 'home' && 'text-white/50')}>{a.name}</span>
            <TeamFlag inst={a} size={20} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- datas no fuso de SP

const partsFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** ISO -> valor de <input type="datetime-local"> no horário de Brasília. */
export function toLocalInput(iso?: string | null) {
  if (!iso) return '';
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Valor do datetime-local (horário de Brasília) -> ISO com offset. */
export const fromLocalInput = (v: string) => `${v}:00-03:00`;

export const toDateInput = (iso?: string | null) => (iso ? toLocalInput(iso).slice(0, 10) : '');

// ---------------------------------------------------------------- mutações com toast

export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>, opts: { ok?: string | ((r: R) => string); invalidate?: unknown[][]; onDone?: (r: R) => void } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: A) => fn(...args),
    onSuccess: (r) => {
      for (const k of opts.invalidate ?? []) qc.invalidateQueries({ queryKey: k });
      const msg = typeof opts.ok === 'function' ? opts.ok(r) : opts.ok;
      if (msg) toast.ok(msg);
      opts.onDone?.(r);
    },
    onError: (e: any) => toast.err(e?.message ?? 'Algo deu errado.'),
  });
}
