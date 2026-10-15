import { CloudUpload, Trash2, Undo2 } from 'lucide-react';
import { memo, useState } from 'react';
import type { InstitutionDTO, TimelineItem } from '@shared/types';
import { TimelineIcon } from '@/components/match/TimelineIcon';
import { Confirm, cx } from '@/components/ui/primitives';
import { fmtScore, timeHM } from '@/lib/format';
import { teamColors } from './helpers';

export const MesaTimeline = memo(function MesaTimeline({
  items,
  pendingIds,
  home,
  away,
  sportIcon,
  canEdit,
  onVoid,
}: {
  items: TimelineItem[];
  pendingIds: Set<string>;
  home: InstitutionDTO | null;
  away: InstitutionDTO | null;
  sportIcon: string;
  canEdit: boolean;
  onVoid: (id: string) => Promise<boolean>;
}) {
  const [showMinor, setShowMinor] = useState(false);
  const [target, setTarget] = useState<TimelineItem | null>(null);
  const [busy, setBusy] = useState(false);
  const list = [...items].reverse();
  const last = list[0];
  const visible = (showMinor ? list : list.filter((t) => !t.minor || t === last)).slice(0, 60);
  const minorCount = list.filter((t) => t.minor).length;
  const hc = teamColors(home);
  const ac = teamColors(away);

  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    await onVoid(target.id);
    setBusy(false);
    setTarget(null);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="label mb-0">Lances</p>
        <div className="flex items-center gap-2">
          {minorCount > 0 && (
            <button onClick={() => setShowMinor((s) => !s)} className="rounded-full bg-white/[0.06] px-3 py-1 text-[12px] font-semibold text-white/80">
              {showMinor ? 'Esconder ponto a ponto' : `Ponto a ponto (${minorCount})`}
            </button>
          )}
          {canEdit && last && (
            <button onClick={() => setTarget(last)} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.09] px-3 py-1.5 text-[12px] font-bold ring-1 ring-white/10 active:scale-95">
              <Undo2 className="h-3.5 w-3.5" /> Desfazer último
            </button>
          )}
        </div>
      </div>
      {!visible.length && <p className="py-6 text-center text-[13px] text-mute">Nenhum lance ainda.</p>}
      <ul className="space-y-1">
        {visible.map((t) => {
          const pending = pendingIds.has(t.id.split(':')[0]);
          const side = t.side === 'home' ? hc : t.side === 'away' ? ac : null;
          return (
            <li key={t.id} className={cx('flex items-center gap-3 rounded-xl px-2.5 py-2', t.important ? 'bg-white/[0.05]' : 'bg-white/[0.02]', pending && 'opacity-70')}>
              <span className="w-12 shrink-0 text-right text-[12px] font-semibold tabular text-mute">{t.minute ?? timeHM(t.at)}</span>
              <span className="h-7 w-1 shrink-0 rounded-full" style={{ background: side?.tone ?? 'transparent' }} />
              <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                <TimelineIcon icon={t.icon} sportIcon={sportIcon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{t.title}</span>
                {(t.subtitle || side) && (
                  <span className="block truncate text-[12px] text-mute">
                    {[side?.inst.name, t.subtitle].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
              {t.scoreAfter && <span className="shrink-0 font-display text-[16px] font-bold tabular">{fmtScore(t.scoreAfter[0])}-{fmtScore(t.scoreAfter[1])}</span>}
              {pending && <CloudUpload className="h-4 w-4 shrink-0 text-warn" aria-label="aguardando envio" />}
              {canEdit && (
                <button aria-label="Excluir lance" onClick={() => setTarget(t)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/40 active:bg-white/10 active:text-live">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <Confirm open={!!target} onClose={() => setTarget(null)} title="Desfazer este lance?" confirmLabel="Desfazer lance" danger loading={busy} onConfirm={confirm}>
        <strong className="text-white">{target?.title}</strong>
        {target?.subtitle ? ` · ${target.subtitle}` : ''} {target?.minute ? `(${target.minute})` : ''}
        <br />O placar é recalculado sem ele, para todo mundo.
      </Confirm>
    </div>
  );
});
