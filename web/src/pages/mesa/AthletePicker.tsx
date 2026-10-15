import { UserPlus, UserX } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import type { PlayerView } from '@shared/types';
import { Button, cx, Sheet, toast } from '@/components/ui/primitives';
import { shortName } from './helpers';

export interface PickerRequest {
  title: string;
  subtitle?: string;
  players: PlayerView[];
  /** atletas destacados primeiro (ex.: em quadra) */
  preferred?: Set<string>;
  preferredLabel?: string;
  otherLabel?: string;
  optional: boolean;
  color: string;
  fg: string;
  onPick: (athleteId: string | null) => void;
  onAdd?: (name: string, number: number | null) => Promise<string>;
}

/** Grade de camisas: um toque escolhe o atleta. */
export function AthletePicker({ req, onClose }: { req: PickerRequest | null; onClose: () => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [num, setNum] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setAdding(false);
    setName('');
    setNum('');
  }, [req]);

  if (!req) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const pref = req.preferred ?? new Set(req.players.filter((p) => p.starter).map((p) => p.athleteId));
  const first = req.players.filter((p) => pref.has(p.athleteId));
  const rest = req.players.filter((p) => !pref.has(p.athleteId));

  const pick = (id: string | null) => {
    req.onPick(id);
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!req.onAdd || name.trim().length < 2) return;
    setBusy(true);
    try {
      const id = await req.onAdd(name.trim(), num ? Number(num) : null);
      pick(id);
    } catch (err: any) {
      toast.err(err.message);
    } finally {
      setBusy(false);
    }
  };

  const Tile = ({ p }: { p: PlayerView }) => (
    <button
      onClick={() => pick(p.athleteId)}
      className="flex min-h-[84px] flex-col items-center justify-center rounded-2xl px-1 py-2 text-center ring-1 ring-white/10 transition active:scale-95"
      style={{ background: 'rgb(var(--fg) / .05)', touchAction: 'manipulation' }}
    >
      <span className="flex h-10 min-w-10 items-center justify-center rounded-xl px-1.5 font-display text-[26px] font-extrabold leading-none" style={{ background: req.color, color: req.fg }}>
        {p.number ?? '–'}
      </span>
      <span className="mt-1.5 line-clamp-2 text-[12px] font-semibold leading-tight">{p.nickname || shortName(p.name)}</span>
    </button>
  );

  return (
    <Sheet
      open={!!req}
      onClose={onClose}
      tone={req.color}
      title={
        <div>
          <div>{req.title}</div>
          {req.subtitle && <div className="text-[12px] font-medium text-mute">{req.subtitle}</div>}
        </div>
      }
    >
      {req.optional && (
        <button onClick={() => pick(null)} className="mb-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white/[0.07] text-[14px] font-semibold active:scale-[0.98]">
          <UserX className="h-4 w-4" /> Registrar sem atleta
        </button>
      )}
      {first.length > 0 && (
        <>
          <p className="label">{req.preferredLabel ?? 'Titulares'}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{first.map((p) => <Tile key={p.athleteId} p={p} />)}</div>
        </>
      )}
      {rest.length > 0 && (
        <>
          <p className="label mt-4">{req.otherLabel ?? 'Banco'}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{rest.map((p) => <Tile key={p.athleteId} p={p} />)}</div>
        </>
      )}
      {!req.players.length && <p className="py-4 text-center text-[13px] text-mute">Nenhum atleta na escalação deste lado.</p>}
      {req.onAdd &&
        (adding ? (
          <form onSubmit={submit} className="mt-4 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/10">
            <p className="label">Novo atleta (entra no elenco)</p>
            <div className="flex gap-2">
              <input className="field w-20 text-center" inputMode="numeric" placeholder="nº" value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, '').slice(0, 3))} />
              <input className="field flex-1" placeholder="Nome" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button type="submit" variant="primary" className="mt-3 w-full" loading={busy} disabled={name.trim().length < 2}>
              Adicionar e escolher
            </Button>
          </form>
        ) : (
          <button onClick={() => setAdding(true)} className={cx('mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[14px] font-semibold border border-dashed border-white/20 active:scale-[0.98]')}>
            <UserPlus className="h-4 w-4" /> Novo atleta
          </button>
        ))}
    </Sheet>
  );
}
