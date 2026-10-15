// Painel do motor RANKING (natação, atletismo, cheerleading...).
import { Medal, Plus, Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import type { ParticipantInfo } from '@shared/engine';
import { parseMark } from '@shared/engine';
import type { InstitutionDTO, RankingRow } from '@shared/types';
import { Button, cx, toast } from '@/components/ui/primitives';
import { TeamFlag } from '@/components/ui/TeamFlag';
import { FALLBACK_INST } from '@/lib/data';
import type { PanelCtx } from './ctx';

type Draft = { id?: string; institutionId: string; athleteName: string; lane: string };

export function ParticipantsEditor({ participants, institutions, onSave }: { participants: ParticipantInfo[]; institutions: InstitutionDTO[]; onSave: (p: { id?: string; institutionId: string; athleteName: string | null; lane: number | null }[]) => Promise<void> }) {
  const [rows, setRows] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setRows(participants.map((p) => ({ id: p.id, institutionId: p.institutionId, athleteName: p.athleteName ?? '', lane: p.lane != null ? String(p.lane) : '' })));
  }, [participants]);
  const upd = (i: number, patch: Partial<Draft>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  const save = async () => {
    if (rows.some((r) => !r.institutionId)) return toast.err('Escolha a atlética de cada participante.');
    setBusy(true);
    try {
      await onSave(rows.map((r) => ({ id: r.id, institutionId: r.institutionId, athleteName: r.athleteName.trim() || null, lane: r.lane ? Number(r.lane) : null })));
      toast.ok('Participantes salvos');
    } catch (e: any) {
      toast.err(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-3">
      <p className="label">Participantes da prova</p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.id ?? `n${i}`} className="flex items-center gap-2">
            <input className="field w-14 px-2 text-center" inputMode="numeric" placeholder="raia" value={r.lane} onChange={(e) => upd(i, { lane: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
            <select className="field w-28 px-2" value={r.institutionId} onChange={(e) => upd(i, { institutionId: e.target.value })}>
              <option value="">Atlética</option>
              {institutions.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <input className="field min-w-0 flex-1" placeholder="Atleta" value={r.athleteName} onChange={(e) => upd(i, { athleteName: e.target.value })} />
            <button aria-label="Remover" onClick={() => setRows((x) => x.filter((_, k) => k !== i))} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-mute hover:text-live">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="outline" className="flex-1" icon={<Plus className="h-4 w-4" />} onClick={() => setRows((r) => [...r, { institutionId: '', athleteName: '', lane: String(r.length + 1) }])}>
          Participante
        </Button>
        <Button variant="primary" className="flex-1" onClick={save} loading={busy}>
          Salvar
        </Button>
      </div>
    </div>
  );
}

function ResultRow({ row, inst, ctx, unit, label }: { row: RankingRow; inst: InstitutionDTO; ctx: PanelCtx; unit: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState('');
  const dis = ctx.disabled || ctx.out.live.phase !== 'PERIOD';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (parseMark(val) == null) return toast.err('Marca inválida. Ex.: 12.45 ou 1:02.35');
    if (ctx.send({ type: 'RESULT', payload: { participantId: row.participantId, value: val, status: 'OK' } })) {
      setOpen(false);
      setVal('');
    }
  };
  const status = (s: 'DNF' | 'DQ' | 'DNS') => {
    if (ctx.send({ type: 'RESULT', payload: { participantId: row.participantId, status: s } })) setOpen(false);
  };
  const pos = row.position;
  return (
    <div className="rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.06]">
      <button disabled={dis} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left disabled:cursor-default">
        <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-[18px] font-extrabold', pos === 1 ? 'bg-[#ffd60a] text-black' : pos === 2 ? 'bg-[#d1d5db] text-black' : pos === 3 ? 'bg-[#d97706] text-black' : 'bg-white/[0.08]')}>
          {pos ?? (row.lane != null ? <span className="text-[12px] text-mute">R{row.lane}</span> : '·')}
        </span>
        <TeamFlag inst={inst} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{row.athleteName || inst.name}</span>
          <span className="block text-[11px] text-mute">
            {inst.name}
            {row.lane != null && ` · raia ${row.lane}`}
          </span>
        </span>
        <span className={cx('font-display text-[20px] font-bold tabular', !row.result && 'text-mute', row.status && row.status !== 'OK' && 'text-live')}>{row.result ?? (dis ? '—' : 'lançar')}</span>
      </button>
      {open && !dis && (
        <form onSubmit={submit} className="space-y-2 border-t border-white/[0.06] p-3">
          <div className="flex gap-2">
            <input className="field h-12 flex-1 font-display text-[22px] tracking-wide" autoFocus inputMode="decimal" placeholder={`${label} (${unit})`} value={val} onChange={(e) => setVal(e.target.value)} />
            <Button type="submit" variant="brand" size="lg">
              Salvar
            </Button>
          </div>
          <div className="flex gap-2">
            {(['DNF', 'DQ', 'DNS'] as const).map((s) => (
              <Button key={s} type="button" variant="outline" size="sm" className="flex-1" onClick={() => status(s)}>
                {s}
              </Button>
            ))}
          </div>
        </form>
      )}
    </div>
  );
}

export function RankingPanel({ ctx, participants, institutions, onSaveParticipants }: { ctx: PanelCtx; participants: ParticipantInfo[]; institutions: InstitutionDTO[]; onSaveParticipants: Parameters<typeof ParticipantsEditor>[0]['onSave'] }) {
  const R = ctx.cfg.ranking ?? { unit: 's', resultLabel: 'Tempo', format: 'time', order: 'asc' };
  const rows = ctx.out.score.ranking ?? [];
  const byId = new Map(institutions.map((i) => [i.id, i]));
  const pre = ctx.out.live.phase === 'PRE';
  const done = rows.filter((r) => r.status);
  const todo = rows.filter((r) => !r.status);

  return (
    <div className="space-y-3">
      {(pre || !participants.length) && !ctx.disabled && <ParticipantsEditor participants={participants} institutions={institutions} onSave={onSaveParticipants} />}
      {!pre && (
        <>
          {todo.length > 0 && (
            <div className="space-y-1.5">
              <p className="label">A lançar · {todo.length}</p>
              {todo.map((r) => (
                <ResultRow key={r.participantId} row={r} inst={byId.get(r.institutionId) ?? FALLBACK_INST} ctx={ctx} unit={R.unit} label={R.resultLabel} />
              ))}
            </div>
          )}
          {done.length > 0 && (
            <div className="space-y-1.5">
              <p className="label flex items-center gap-1.5">
                <Medal className="h-3.5 w-3.5" /> Classificação parcial
              </p>
              {done.map((r) => (
                <ResultRow key={r.participantId} row={r} inst={byId.get(r.institutionId) ?? FALLBACK_INST} ctx={ctx} unit={R.unit} label={R.resultLabel} />
              ))}
            </div>
          )}
        </>
      )}
      {pre && participants.length > 0 && <p className="text-center text-[13px] text-mute">Inicie a prova para lançar as marcas.</p>}
    </div>
  );
}
