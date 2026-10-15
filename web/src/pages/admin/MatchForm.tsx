// Formulário de jogo (criar / editar / duplicar) + criação em lote de rodada.
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Gender } from '@shared/types';
import { Button, Sheet, Spinner, toast } from '@/components/ui/primitives';
import { SportIcon } from '@/components/ui/SportIcon';
import { TeamFlag } from '@/components/ui/TeamFlag';
import { get, patch, post } from '@/lib/api';
import { GENDER } from '@/lib/format';
import { useAdmin } from './ctx';
import { Field, fromLocalInput, NumInput, Select, toLocalInput, Toggle, useAction } from './ui';

interface Participant {
  id?: string;
  institutionId: string;
  athleteName: string;
  lane: number | null;
}

export interface MatchFormState {
  tournamentId: string;
  sportId: string;
  gender: Gender;
  phase: string;
  group: string;
  title: string;
  venue: string;
  when: string;
  homeId: string;
  awayId: string;
  mesarioId: string;
  backupMesarioId: string;
  countsForStandings: boolean;
  notes: string;
  status: 'SCHEDULED' | 'POSTPONED' | 'CANCELED';
  participants: Participant[];
}

const PHASE_SUGGESTIONS = ['Fase de grupos', 'Oitavas de final', 'Quartas de final', 'Semifinal', 'Disputa de 3º lugar', 'Final', 'Amistoso', 'Eliminatória'];

export const blankForm = (tournamentId: string, sportId = ''): MatchFormState => ({
  tournamentId,
  sportId,
  gender: 'M',
  phase: '',
  group: '',
  title: '',
  venue: '',
  when: toLocalInput(new Date(Math.ceil(Date.now() / 3600_000) * 3600_000).toISOString()),
  homeId: '',
  awayId: '',
  mesarioId: '',
  backupMesarioId: '',
  countsForStandings: true,
  notes: '',
  status: 'SCHEDULED',
  participants: [],
});

const n = (s: string) => (s.trim() ? s.trim() : null);

/** Abre em modo edição (id) ou criação (initial, ex.: duplicar). */
export function MatchFormSheet({ open, onClose, editId, initial }: { open: boolean; onClose: () => void; editId?: string | null; initial?: MatchFormState | null }) {
  const { tournamentId, tournaments, sports, institutions, users, sport } = useAdmin();
  const [f, setF] = useState<MatchFormState | null>(null);
  const [statusTouched, setStatusTouched] = useState(false);

  const q = useQuery({ queryKey: ['admin', 'match', editId], queryFn: () => get<any>(`/admin/matches/${editId}`), enabled: open && !!editId });

  useEffect(() => {
    if (!open) return setF(null);
    setStatusTouched(false);
    if (editId) {
      const m = q.data?.match;
      if (!m) return;
      setF({
        tournamentId: m.tournamentId,
        sportId: m.sportId,
        gender: m.gender,
        phase: m.phase ?? '',
        group: m.group ?? '',
        title: m.title ?? '',
        venue: m.venue ?? '',
        when: toLocalInput(m.scheduledAt),
        homeId: m.homeId ?? '',
        awayId: m.awayId ?? '',
        mesarioId: m.mesarioId ?? '',
        backupMesarioId: m.backupMesarioId ?? '',
        countsForStandings: m.countsForStandings,
        notes: m.notes ?? '',
        status: ['POSTPONED', 'CANCELED'].includes(m.status) ? m.status : 'SCHEDULED',
        participants: (m.participants ?? []).map((p: any) => ({ id: p.id, institutionId: p.institutionId, athleteName: p.athleteName ?? '', lane: p.lane })),
      });
    } else setF(initial ?? blankForm(tournamentId ?? '', sports.find((s) => s.active)?.id));
  }, [open, editId, q.data, initial]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = sport(f?.sportId);
  const isRanking = s?.engine === 'RANKING';
  const eligible = useMemo(() => users.filter((u) => u.active && (u.role === 'ADMIN' || (f && u.sportIds.includes(f.sportId)))), [users, f?.sportId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useAction(
    async (st: MatchFormState) => {
      const body: Record<string, unknown> = {
        tournamentId: st.tournamentId,
        sportId: st.sportId,
        gender: st.gender,
        phase: n(st.phase),
        group: n(st.group),
        title: n(st.title),
        venue: n(st.venue),
        scheduledAt: fromLocalInput(st.when),
        homeId: isRanking ? null : n(st.homeId),
        awayId: isRanking ? null : n(st.awayId),
        mesarioId: n(st.mesarioId),
        backupMesarioId: n(st.backupMesarioId),
        countsForStandings: st.countsForStandings,
        notes: n(st.notes),
        ...(isRanking && { participants: st.participants.filter((p) => p.institutionId).map((p) => ({ ...(p.id && { id: p.id }), institutionId: p.institutionId, athleteName: n(p.athleteName), lane: p.lane })) }),
      };
      if (!editId || statusTouched) body.status = st.status;
      return editId ? patch(`/admin/matches/${editId}`, body) : post('/admin/matches', body);
    },
    { ok: editId ? 'Jogo atualizado' : 'Jogo criado', invalidate: [['admin', 'matches'], ['admin', 'dashboard'], ['admin', 'match', editId]], onDone: onClose },
  );

  const set = <K extends keyof MatchFormState>(k: K, v: MatchFormState[K]) => setF((x) => (x ? { ...x, [k]: v } : x));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      wide
      title={editId ? 'Editar jogo' : 'Novo jogo'}
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="brand" className="flex-1" disabled={!f} loading={save.isPending} onClick={() => f && save.mutate([f])}>
            {editId ? 'Salvar' : 'Criar jogo'}
          </Button>
        </div>
      }
    >
      {!f ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Torneio">
            <Select value={f.tournamentId} onChange={(v) => set('tournamentId', v)}>
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.isSandbox ? '🧪 ' : ''}
                  {t.name} {t.edition ?? ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Modalidade">
            <div className="flex items-center gap-2">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                <SportIcon name={s?.icon} size={20} />
              </span>
              <Select
                value={f.sportId}
                onChange={(v) => {
                  const ns = sport(v);
                  setF((x) => (x ? { ...x, sportId: v, gender: ns && !ns.genders.includes(x.gender) ? ns.genders[0] : x.gender } : x));
                }}
              >
                <option value="">Escolha…</option>
                {sports
                  .filter((x) => x.active || x.id === f.sportId)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </Select>
            </div>
          </Field>
          <Field label="Naipe">
            <div className="flex gap-1.5">
              {(s?.genders ?? (['M', 'F', 'X'] as Gender[])).map((g) => (
                <button key={g} type="button" onClick={() => set('gender', g)} className={`flex-1 rounded-xl py-2.5 text-[14px] font-semibold ring-1 ring-white/10 ${f.gender === g ? 'bg-white text-black' : 'bg-ink-800 text-white/75'}`}>
                  {GENDER[g]}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Data e hora (Brasília)">
            <input type="datetime-local" className="field" value={f.when} onChange={(e) => set('when', e.target.value)} />
          </Field>
          <Field label="Fase">
            <input className="field" list="phases" value={f.phase} onChange={(e) => set('phase', e.target.value)} placeholder="Fase de grupos" />
            <datalist id="phases">
              {PHASE_SUGGESTIONS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <Field label="Grupo">
              <input className="field" value={f.group} onChange={(e) => set('group', e.target.value)} placeholder="A" maxLength={12} />
            </Field>
            <Field label="Local">
              <input className="field" value={f.venue} onChange={(e) => set('venue', e.target.value)} placeholder="Ginásio Poliesportivo" />
            </Field>
          </div>

          {isRanking ? (
            <>
              <Field label="Nome da prova" className="sm:col-span-2">
                <input className="field" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="100m rasos" />
              </Field>
              <div className="sm:col-span-2">
                <span className="label">Participantes</span>
                <div className="space-y-2">
                  {f.participants.map((p, i) => {
                    const inst = institutions.find((x) => x.id === p.institutionId);
                    const upd = (patchP: Partial<Participant>) => set('participants', f.participants.map((x, j) => (j === i ? { ...x, ...patchP } : x)));
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-14 shrink-0">
                          <NumInput value={p.lane} onChange={(v) => upd({ lane: v })} placeholder="raia" />
                        </span>
                        {inst ? <TeamFlag inst={inst} size={28} /> : <span className="h-7 w-7 shrink-0 rounded-full bg-white/10" />}
                        <Select value={p.institutionId} onChange={(v) => upd({ institutionId: v })} className="max-w-[180px]">
                          <option value="">Atlética…</option>
                          {institutions.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </Select>
                        <input className="field" placeholder="Nome do atleta (opcional)" value={p.athleteName} onChange={(e) => upd({ athleteName: e.target.value })} />
                        <button type="button" onClick={() => set('participants', f.participants.filter((_, j) => j !== i))} className="rounded-lg p-2 text-mute hover:bg-white/10 hover:text-live" aria-label="Remover">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                  <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => set('participants', [...f.participants, { institutionId: '', athleteName: '', lane: f.participants.length + 1 }])}>
                    Adicionar participante
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              {(['homeId', 'awayId'] as const).map((k) => {
                const inst = institutions.find((x) => x.id === f[k]);
                return (
                  <Field key={k} label={k === 'homeId' ? 'Mandante' : 'Visitante'}>
                    <div className="flex items-center gap-2">
                      {inst ? <TeamFlag inst={inst} size={40} /> : <span className="h-10 w-10 shrink-0 rounded-full bg-white/[0.06]" />}
                      <Select value={f[k]} onChange={(v) => set(k, v)}>
                        <option value="">Escolha a atlética…</option>
                        {institutions.map((x) => (
                          <option key={x.id} value={x.id} disabled={x.id === (k === 'homeId' ? f.awayId : f.homeId)}>
                            {x.name}
                            {x.university ? ` · ${x.university}` : ''}
                            {x.isSandbox ? ' (sandbox)' : ''}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </Field>
                );
              })}
            </>
          )}

          <Field label="Mesário titular" hint={f.sportId && !eligible.some((u) => u.role === 'MESARIO') ? 'Nenhum mesário habilitado nesta modalidade (ver Equipe).' : undefined}>
            <Select value={f.mesarioId} onChange={(v) => set('mesarioId', v)}>
              <option value="">— sem mesário —</option>
              {eligible.map((u) => (
                <option key={u.id} value={u.id} disabled={u.id === f.backupMesarioId}>
                  {u.name}
                  {u.role === 'ADMIN' ? ' (admin)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Mesário reserva" hint="Só registra quando você liberar na hora.">
            <Select value={f.backupMesarioId} onChange={(v) => set('backupMesarioId', v)}>
              <option value="">— sem reserva —</option>
              {eligible.map((u) => (
                <option key={u.id} value={u.id} disabled={u.id === f.mesarioId}>
                  {u.name}
                  {u.role === 'ADMIN' ? ' (admin)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status manual">
            <Select
              value={f.status}
              onChange={(v) => {
                setStatusTouched(true);
                set('status', v as MatchFormState['status']);
              }}
            >
              <option value="SCHEDULED">Normal (agendado / automático)</option>
              <option value="POSTPONED">Adiado</option>
              <option value="CANCELED">Cancelado</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <Toggle checked={f.countsForStandings} onChange={(v) => set('countsForStandings', v)} label="Conta pra classificação" hint="Desligue em amistosos/exibição" />
          </div>
          <Field label="Observações" className="sm:col-span-2">
            <textarea className="field min-h-[70px]" value={f.notes} onChange={(e) => set('notes', e.target.value)} maxLength={500} />
          </Field>
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- rodada em lote

interface BulkRow {
  homeId: string;
  awayId: string;
  time: string;
  group: string;
}

export function BulkSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tournamentId, sports, institutions, sport, refresh } = useAdmin();
  const [sportId, setSportId] = useState('');
  const [gender, setGender] = useState<Gender>('M');
  const [date, setDate] = useState(() => toLocalInput(new Date().toISOString()).slice(0, 10));
  const [venue, setVenue] = useState('');
  const [phase, setPhase] = useState('Fase de grupos');
  const [rows, setRows] = useState<BulkRow[]>([{ homeId: '', awayId: '', time: '09:00', group: '' }]);
  const [busy, setBusy] = useState(false);
  const s = sport(sportId);

  const run = async () => {
    const valid = rows.filter((r) => r.homeId && r.awayId && r.time);
    if (!sportId || !valid.length) return toast.err('Escolha a modalidade e preencha ao menos uma linha.');
    setBusy(true);
    let ok = 0;
    for (const r of valid) {
      try {
        await post('/admin/matches', {
          tournamentId,
          sportId,
          gender,
          phase: phase || null,
          group: r.group || null,
          venue: venue || null,
          scheduledAt: fromLocalInput(`${date}T${r.time}`),
          homeId: r.homeId,
          awayId: r.awayId,
          countsForStandings: true,
        });
        ok++;
      } catch (e: any) {
        toast.err(`Linha ${valid.indexOf(r) + 1}: ${e.message}`);
      }
    }
    setBusy(false);
    refresh();
    if (ok) {
      toast.ok(`${ok} jogo(s) criado(s)`);
      onClose();
      setRows([{ homeId: '', awayId: '', time: '09:00', group: '' }]);
    }
  };

  const updRow = (i: number, p: Partial<BulkRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      wide
      title="Criar rodada"
      footer={
        <Button variant="brand" className="w-full" loading={busy} onClick={run}>
          Criar {rows.filter((r) => r.homeId && r.awayId).length} jogo(s)
        </Button>
      }
    >
      <p className="mb-4 text-[13px] text-mute">Mesma modalidade, naipe, dia e local — uma linha por confronto. Mesários você escala depois na lista. Elencos cadastrados são importados automaticamente.</p>
      <div className="mb-4 grid gap-3 sm:grid-cols-5">
        <Field label="Modalidade" className="sm:col-span-2">
          <Select value={sportId} onChange={(v) => { setSportId(v); const ns = sport(v); if (ns && !ns.genders.includes(gender)) setGender(ns.genders[0]); }}>
            <option value="">Escolha…</option>
            {sports
              .filter((x) => x.active && x.engine !== 'RANKING')
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Naipe">
          <Select value={gender} onChange={(v) => setGender(v as Gender)}>
            {(s?.genders ?? (['M', 'F', 'X'] as Gender[])).map((g) => (
              <option key={g} value={g}>
                {GENDER[g]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Dia">
          <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Fase">
          <input className="field" value={phase} onChange={(e) => setPhase(e.target.value)} />
        </Field>
        <Field label="Local" className="sm:col-span-5">
          <input className="field" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Ginásio Poliesportivo" />
        </Field>
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[84px_1fr_1fr_60px_36px] items-center gap-2">
            <input type="time" className="field px-2" value={r.time} onChange={(e) => updRow(i, { time: e.target.value })} />
            {(['homeId', 'awayId'] as const).map((k) => (
              <Select key={k} value={r[k]} onChange={(v) => updRow(i, { [k]: v })}>
                <option value="">{k === 'homeId' ? 'Mandante' : 'Visitante'}</option>
                {institutions.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            ))}
            <input className="field px-2 text-center" placeholder="Gr." value={r.group} onChange={(e) => updRow(i, { group: e.target.value })} />
            <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="rounded-lg p-2 text-mute hover:text-live" aria-label="Remover linha">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button
          size="sm"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => {
            const last = rows[rows.length - 1];
            const [h, m] = (last?.time ?? '09:00').split(':').map(Number);
            const t = new Date(2000, 0, 1, h, m + 60);
            setRows([...rows, { homeId: '', awayId: '', group: last?.group ?? '', time: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}` }]);
          }}
        >
          Linha (+1h)
        </Button>
      </div>
    </Sheet>
  );
}
