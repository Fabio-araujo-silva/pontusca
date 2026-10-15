import { Crown, Plus, UserPlus, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { InstitutionDTO, PlayerView, Side, SportConfig } from '@shared/types';
import { Button, cx, Segmented, Sheet, toast } from '@/components/ui/primitives';
import { teamColors } from './helpers';
import type { RosterItem } from './types';

interface Row {
  athleteId: string;
  name: string;
  number: string;
  position: string;
  starter: boolean;
  captain: boolean;
}

const toRows = (ps: PlayerView[]): Row[] => ps.map((p) => ({ athleteId: p.athleteId, name: p.nickname || p.name, number: p.number != null ? String(p.number) : '', position: p.position ?? '', starter: p.starter, captain: p.captain }));

export function LineupSheet({
  open,
  onClose,
  lineups,
  roster,
  home,
  away,
  cfg,
  readOnly,
  onSave,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  lineups: { home: PlayerView[]; away: PlayerView[] };
  roster: { home: RosterItem[]; away: RosterItem[] };
  home: InstitutionDTO | null;
  away: InstitutionDTO | null;
  cfg: SportConfig;
  readOnly: boolean;
  onSave: (side: Side, players: { athleteId: string; number: number | null; position: string | null; starter: boolean; captain: boolean }[]) => Promise<unknown>;
  onAdd: (side: Side, name: string, number: number | null, starter: boolean) => Promise<string>;
}) {
  const [side, setSide] = useState<Side>('home');
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNum, setNewNum] = useState('');

  useEffect(() => {
    if (!open) return;
    setRows(toRows(lineups[side]));
    setDirty(false);
  }, [open, side, lineups]);

  const c = teamColors(side === 'home' ? home : away);
  const expected = cfg.lineup?.starters ?? 0;
  const starters = rows.filter((r) => r.starter).length;
  const inLineup = useMemo(() => new Set(rows.map((r) => r.athleteId)), [rows]);
  const available = roster[side].filter((r) => !inLineup.has(r.athleteId));
  const positions = cfg.lineup?.positions ?? [];

  const upd = (id: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.athleteId === id ? { ...r, ...patch } : patch.captain ? { ...r, captain: false } : r)));
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await onSave(
        side,
        rows.map((r) => ({ athleteId: r.athleteId, number: r.number ? Number(r.number) : null, position: r.position.trim() || null, starter: r.starter, captain: r.captain })),
      );
      setDirty(false);
      toast.ok('Escalação salva');
    } catch (e: any) {
      toast.err(e.message);
    } finally {
      setBusy(false);
    }
  };

  const addNew = async (e: FormEvent) => {
    e.preventDefault();
    if (newName.trim().length < 2) return;
    if (dirty) await save();
    setBusy(true);
    try {
      await onAdd(side, newName.trim(), newNum ? Number(newNum) : null, starters < expected);
      setNewName('');
      setNewNum('');
      toast.ok('Atleta adicionado');
    } catch (err: any) {
      toast.err(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      wide
      tone={c.tone}
      title="Escalação"
      footer={
        !readOnly && (
          <Button variant="primary" size="lg" className="w-full" onClick={save} loading={busy} disabled={!dirty}>
            {dirty ? `Salvar escalação · ${c.inst.name}` : 'Escalação salva'}
          </Button>
        )
      }
    >
      <Segmented
        className="mb-3 w-full"
        value={side}
        onChange={(v) => {
          if (dirty) {
            toast.info('Salve a escalação antes de trocar de lado.');
            return;
          }
          setSide(v);
        }}
        options={[
          { value: 'home', label: teamColors(home).inst.name },
          { value: 'away', label: teamColors(away).inst.name },
        ]}
      />
      {expected > 0 && (
        <p className={cx('mb-3 text-[13px] font-semibold', starters === expected ? 'text-win' : 'text-warn')}>
          {starters}/{expected} titulares
        </p>
      )}
      {positions.length > 0 && (
        <datalist id="mesa-positions">
          {positions.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      )}
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.athleteId} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-2 py-1.5 ring-1 ring-white/[0.05]">
            <input disabled={readOnly} className="field w-14 px-1 text-center font-display text-[18px] font-bold" inputMode="numeric" placeholder="nº" value={r.number} onChange={(e) => upd(r.athleteId, { number: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{r.name}</span>
            <input disabled={readOnly} list="mesa-positions" className="field w-16 px-1 text-center text-[12px] uppercase" placeholder="pos" value={r.position} onChange={(e) => upd(r.athleteId, { position: e.target.value.toUpperCase().slice(0, 6) })} />
            <button disabled={readOnly} aria-label="Capitão" onClick={() => upd(r.athleteId, { captain: !r.captain })} className={cx('flex h-9 w-9 items-center justify-center rounded-lg', r.captain ? 'bg-brand text-brand-ink' : 'bg-white/[0.05] text-white/40')}>
              <Crown className="h-4 w-4" />
            </button>
            <button
              disabled={readOnly}
              onClick={() => upd(r.athleteId, { starter: !r.starter })}
              className={cx('h-9 w-[74px] rounded-lg text-[12px] font-bold', r.starter ? 'text-black' : 'bg-white/[0.06] text-white/60')}
              style={r.starter ? { background: c.bg, color: c.fg } : undefined}
            >
              {r.starter ? 'Titular' : 'Banco'}
            </button>
            {!readOnly && (
              <button
                aria-label="Tirar da escalação"
                onClick={() => {
                  setRows((rs) => rs.filter((x) => x.athleteId !== r.athleteId));
                  setDirty(true);
                }}
                className="flex h-9 w-7 items-center justify-center text-white/30"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {!rows.length && <p className="py-4 text-center text-[13px] text-mute">Ninguém escalado ainda.</p>}
      </div>

      {!readOnly && (
        <>
          {available.length > 0 && (
            <>
              <p className="label mt-5">Elenco da atlética</p>
              <div className="flex flex-wrap gap-1.5">
                {available.map((a) => (
                  <button
                    key={a.athleteId}
                    onClick={() => {
                      setRows((rs) => [...rs, { athleteId: a.athleteId, name: a.nickname || a.name, number: a.number != null ? String(a.number) : '', position: a.position ?? '', starter: false, captain: false }]);
                      setDirty(true);
                    }}
                    className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold ring-1', a.inRoster ? 'bg-white/[0.07] ring-white/10' : 'bg-transparent text-white/60 ring-white/[0.06]')}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {a.number != null && <span className="font-display text-[14px]">{a.number}</span>}
                    {a.nickname || a.name}
                  </button>
                ))}
              </div>
            </>
          )}
          <form onSubmit={addNew} className="mt-5 rounded-2xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
            <p className="label">Novo atleta na hora</p>
            <div className="flex gap-2">
              <input className="field w-16 text-center" inputMode="numeric" placeholder="nº" value={newNum} onChange={(e) => setNewNum(e.target.value.replace(/\D/g, '').slice(0, 3))} />
              <input className="field flex-1" placeholder="Nome do atleta" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Button type="submit" variant="outline" disabled={newName.trim().length < 2 || busy} icon={<UserPlus className="h-4 w-4" />}>
                <span className="hidden sm:inline">Adicionar</span>
              </Button>
            </div>
          </form>
        </>
      )}
    </Sheet>
  );
}
