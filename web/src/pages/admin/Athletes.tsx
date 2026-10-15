// Atletas & elencos: cadastro de atletas por atlética e elenco por modalidade/naipe
// (com "colar lista" pra subir um time inteiro de uma vez).
import { useQuery } from '@tanstack/react-query';
import { ClipboardPaste, Pencil, Plus, Save, Shirt, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Gender } from '@shared/types';
import { Button, Confirm, cx, Empty, Sheet, Spinner } from '@/components/ui/primitives';
import { SportIcon } from '@/components/ui/SportIcon';
import { TeamFlag } from '@/components/ui/TeamFlag';
import { del, get, patch, post, put } from '@/lib/api';
import { GENDER } from '@/lib/format';
import { useAdmin } from './ctx';
import { Field, NumInput, PageHeader, Select, useAction } from './ui';

interface Athlete {
  id: string;
  institutionId: string;
  name: string;
  nickname: string | null;
  course: string | null;
  isSandbox: boolean;
  rosters: { id: string; sportId: string; gender: string; number: number | null; position: string | null; sport: { name: string } }[];
}
interface RosterEntry {
  athleteId: string;
  number: number | null;
  position: string | null;
  athlete?: Athlete;
}

export default function Athletes() {
  const { institutions, sports, sport } = useAdmin();
  const [instId, setInstId] = useState('');
  const [search, setSearch] = useState('');
  const [sportId, setSportId] = useState('');
  const [gender, setGender] = useState<Gender>('M');
  const [edit, setEdit] = useState<Partial<Athlete> | null>(null);
  const [delA, setDelA] = useState<Athlete | null>(null);
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');

  useEffect(() => {
    if (!instId && institutions.length) setInstId(institutions[0].id);
  }, [institutions, instId]);
  useEffect(() => {
    if (!sportId && sports.length) setSportId(sports.find((s) => s.active && s.engine !== 'RANKING')?.id ?? sports[0].id);
  }, [sports, sportId]);

  const inst = institutions.find((i) => i.id === instId);
  const s = sport(sportId);
  const aKey = ['admin', 'athletes', instId];
  const rKey = ['admin', 'roster', instId, sportId, gender];
  const aq = useQuery({ queryKey: aKey, queryFn: () => get<Athlete[]>(`/admin/athletes?institutionId=${instId}`), enabled: !!instId });
  const rq = useQuery({ queryKey: rKey, queryFn: () => get<RosterEntry[]>(`/admin/rosters?institutionId=${instId}&sportId=${sportId}&gender=${gender}`), enabled: !!instId && !!sportId });

  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setRoster((rq.data ?? []).map((r) => ({ athleteId: r.athleteId, number: r.number, position: r.position })));
    setDirty(false);
  }, [rq.data]);

  const athletes = aq.data ?? [];
  const byId = useMemo(() => new Map(athletes.map((a) => [a.id, a])), [athletes]);
  const visible = athletes.filter((a) => !search || `${a.name} ${a.nickname ?? ''} ${a.course ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const notInRoster = athletes.filter((a) => !roster.some((r) => r.athleteId === a.id));

  const saveAthlete = useAction(
    (a: Partial<Athlete>) => {
      const body = { institutionId: instId, name: a.name ?? '', nickname: a.nickname || null, course: a.course || null };
      return a.id ? patch(`/admin/athletes/${a.id}`, body) : post('/admin/athletes', body);
    },
    { ok: 'Atleta salvo', invalidate: [aKey], onDone: () => setEdit(null) },
  );
  const removeAthlete = useAction((id: string) => del(`/admin/athletes/${id}`), { ok: 'Atleta excluído', invalidate: [aKey, rKey], onDone: () => setDelA(null) });
  const saveRoster = useAction(() => put('/admin/rosters', { institutionId: instId, sportId, gender, entries: roster }), { ok: 'Elenco salvo', invalidate: [rKey, aKey] });
  const bulkAdd = useAction(() => post<{ created: number }>('/admin/rosters/bulk', { institutionId: instId, sportId, gender, text: bulkText }), {
    ok: (r) => `${r.created} atleta(s) no elenco`,
    invalidate: [rKey, aKey],
    onDone: () => (setBulk(false), setBulkText('')),
  });

  const updRoster = (i: number, p: Partial<RosterEntry>) => {
    setRoster((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
    setDirty(true);
  };
  const positions = s?.config.lineup?.positions ?? [];

  return (
    <div>
      <PageHeader title="Atletas & elencos" subtitle="O elenco de cada modalidade é puxado automaticamente pra escalação dos jogos" />

      <div className="scroll-x -mx-4 mb-5 gap-2 px-4">
        {institutions.map((i) => (
          <button key={i.id} onClick={() => setInstId(i.id)} className={cx('flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3.5 text-[13px] font-semibold transition', i.id === instId ? 'bg-white text-black' : 'bg-white/[0.06] text-white/75 hover:bg-white/[0.1]')}>
            <TeamFlag inst={i} size={26} />
            {i.name}
          </button>
        ))}
      </div>

      {!inst ? (
        <Empty title="Cadastre uma atlética primeiro" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* elenco */}
          <section className="card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="mr-auto flex items-center gap-2 text-[15px] font-bold">
                <Shirt className="h-4 w-4 text-brand" /> Elenco
              </h2>
              <Select value={sportId} onChange={(v) => { setSportId(v); const ns = sport(v); if (ns && !ns.genders.includes(gender)) setGender(ns.genders[0]); }} className="h-9 w-48 py-1 text-[13px]">
                {sports
                  .filter((x) => x.engine !== 'RANKING')
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </Select>
              <Select value={gender} onChange={(v) => setGender(v as Gender)} className="h-9 w-32 py-1 text-[13px]">
                {(s?.genders ?? (['M', 'F', 'X'] as Gender[])).map((g) => (
                  <option key={g} value={g}>
                    {GENDER[g]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="mb-3 flex items-center gap-2 text-[12px] text-mute">
              <SportIcon name={s?.icon} size={14} /> {inst.name} · {s?.name} {GENDER[gender]} · {roster.length} atletas
              {s?.config.lineup?.starters ? ` · ${s.config.lineup.starters} titulares` : ''}
            </div>
            {rq.isLoading ? (
              <Spinner />
            ) : (
              <div className="space-y-1.5">
                {roster.length === 0 && <p className="py-6 text-center text-[13px] text-mute">Elenco vazio. Adicione atletas abaixo ou cole uma lista.</p>}
                {roster.map((r, i) => {
                  const a = byId.get(r.athleteId);
                  return (
                    <div key={r.athleteId} className="flex items-center gap-2">
                      <NumInput value={r.number} onChange={(v) => updRoster(i, { number: v })} className="w-16 text-center font-display text-[17px] font-bold" placeholder="#" min={0} max={999} />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                        {a?.name ?? '…'}
                        {a?.nickname && <span className="text-mute"> “{a.nickname}”</span>}
                      </span>
                      <input className="field w-20 px-2 text-center uppercase" list="positions" placeholder="pos." value={r.position ?? ''} onChange={(e) => updRoster(i, { position: e.target.value.toUpperCase() || null })} maxLength={12} />
                      <button
                        className="rounded-lg p-2 text-mute hover:text-live"
                        onClick={() => {
                          setRoster(roster.filter((_, j) => j !== i));
                          setDirty(true);
                        }}
                        aria-label="Tirar do elenco"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
                <datalist id="positions">
                  {positions.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Select
                value=""
                onChange={(v) => {
                  if (!v) return;
                  setRoster([...roster, { athleteId: v, number: null, position: null }]);
                  setDirty(true);
                }}
                className="h-9 flex-1 py-1 text-[13px]"
              >
                <option value="">+ Adicionar atleta da atlética…</option>
                {notInRoster.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
              <Button size="sm" icon={<ClipboardPaste className="h-4 w-4" />} onClick={() => setBulk(true)}>
                Colar lista
              </Button>
              <Button size="sm" variant="brand" icon={<Save className="h-4 w-4" />} disabled={!dirty} loading={saveRoster.isPending} onClick={() => saveRoster.mutate([])}>
                Salvar elenco
              </Button>
            </div>
          </section>

          {/* atletas */}
          <section className="card p-4">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="mr-auto text-[15px] font-bold">Atletas · {athletes.length}</h2>
              <input className="field h-9 w-40 py-1 text-[13px]" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <Button size="sm" variant="brand" icon={<UserPlus className="h-4 w-4" />} onClick={() => setEdit({})}>
                Novo
              </Button>
            </div>
            {aq.isLoading ? (
              <Spinner />
            ) : visible.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-mute">Nenhum atleta.</p>
            ) : (
              <div className="max-h-[560px] divide-y divide-white/[0.05] overflow-y-auto">
                {visible.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium">
                        {a.name}
                        {a.nickname && <span className="text-mute"> “{a.nickname}”</span>}
                      </div>
                      <div className="truncate text-[12px] text-mute">
                        {[a.course, ...a.rosters.map((r) => `${r.sport.name} ${r.gender}${r.number != null ? ` #${r.number}` : ''}`)].filter(Boolean).join(' · ') || 'sem modalidade'}
                      </div>
                    </div>
                    <button className="rounded-lg p-1.5 text-mute hover:bg-white/10 hover:text-white" onClick={() => setEdit(a)} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button className="rounded-lg p-1.5 text-mute hover:bg-white/10 hover:text-live" onClick={() => setDelA(a)} aria-label="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <Sheet
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? 'Editar atleta' : `Novo atleta · ${inst?.name ?? ''}`}
        footer={
          <Button variant="brand" className="w-full" loading={saveAthlete.isPending} onClick={() => edit && saveAthlete.mutate([edit])}>
            Salvar
          </Button>
        }
      >
        {edit && (
          <div className="grid gap-4">
            <Field label="Nome">
              <input className="field" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus />
            </Field>
            <Field label="Apelido" hint="Se preenchido, aparece no lugar do nome nos lances">
              <input className="field" value={edit.nickname ?? ''} onChange={(e) => setEdit({ ...edit, nickname: e.target.value })} />
            </Field>
            <Field label="Curso">
              <input className="field" value={edit.course ?? ''} onChange={(e) => setEdit({ ...edit, course: e.target.value })} placeholder="Eng. Mecânica" />
            </Field>
          </div>
        )}
      </Sheet>

      <Sheet
        open={bulk}
        onClose={() => setBulk(false)}
        title={`Colar elenco · ${s?.name ?? ''} ${GENDER[gender]}`}
        footer={
          <Button variant="brand" className="w-full" icon={<Plus className="h-4 w-4" />} loading={bulkAdd.isPending} onClick={() => bulkAdd.mutate([])} disabled={!bulkText.trim()}>
            Adicionar ao elenco
          </Button>
        }
      >
        <p className="mb-2 text-[13px] text-mute">
          Uma linha por atleta: <code className="rounded bg-white/10 px-1">número nome - posição</code>. Número, apelido entre aspas e posição são opcionais. Atletas com o mesmo nome são reaproveitados.
        </p>
        <pre className="mb-3 rounded-xl bg-white/[0.04] p-3 text-[12px] text-white/60">{'1 Pedro "Paredão" Lima - GOL\n10 João Silva - ATA\nMaria Souza'}</pre>
        <textarea className="field min-h-[220px] font-mono text-[13px]" value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder="Cole aqui…" />
      </Sheet>

      <Confirm open={!!delA} onClose={() => setDelA(null)} title={`Excluir ${delA?.name}?`} danger confirmLabel="Excluir" onConfirm={() => delA && removeAthlete.mutate([delA.id])}>
        Sai de todos os elencos e escalações. Lances já registrados continuam valendo no placar.
      </Confirm>
    </div>
  );
}
