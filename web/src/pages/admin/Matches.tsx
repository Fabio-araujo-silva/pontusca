// Jogos do torneio: filtros rápidos, lista agrupada por dia e todas as ações
// (editar, duplicar, resultado manual, reserva, elencos, zerar, excluir).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Copy, Eye, ListPlus, Lock, LockOpen, MonitorPlay, Pencil, Plus, RotateCcw, Search, Shirt, Trash2, Trophy, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { MatchSummary } from '@shared/types';
import { Button, Confirm, cx, Empty, Sheet, Spinner } from '@/components/ui/primitives';
import { TeamFlag } from '@/components/ui/TeamFlag';
import { del, get, post, put } from '@/lib/api';
import { dayChip, dayKey, fmtScore, longDate, timeHM } from '@/lib/format';
import { useRooms, useSocketEvent } from '@/lib/socket';
import { AdminMatchRow, useAdmin } from './ctx';
import { StaffButton, StaffPicker, StaffRole } from './Staff';
import { BulkSheet, MatchFormSheet, MatchFormState, splitNotes } from './MatchForm';
import { Field, MATCH_DATA_KEYS, MatchLine, NumInput, PageHeader, Select, StatusPill, toLocalInput, useAction } from './ui';

const STATUS_FILTERS = [
  ['', 'Todos'],
  ['LIVE', 'Ao vivo'],
  ['SCHEDULED', 'Agendados'],
  ['FINISHED', 'Encerrados'],
  ['POSTPONED', 'Adiados'],
  ['CANCELED', 'Cancelados'],
] as const;

export default function Matches() {
  const { tournamentId, tournament, sports, institutions, inst, sport } = useAdmin();
  const qc = useQueryClient();
  const key = ['admin', 'matches', tournamentId];
  const q = useQuery({ queryKey: key, queryFn: () => get<AdminMatchRow[]>(`/admin/matches?tournamentId=${tournamentId}`), enabled: !!tournamentId });
  useRooms([tournament?.isSandbox ? 'ops:sandbox' : 'ops']);
  useSocketEvent<{ summary: MatchSummary }>('summary', ({ summary }) => {
    qc.setQueryData<AdminMatchRow[]>(key, (rows) => rows?.map((r) => (r.summary.id === summary.id ? { ...r, summary } : r)));
  });
  useSocketEvent('feed:changed', () => qc.invalidateQueries({ queryKey: key }));

  const [day, setDay] = useState('');
  const [sportId, setSportId] = useState('');
  const [status, setStatus] = useState('');
  const [instId, setInstId] = useState('');
  const [text, setText] = useState('');
  const [form, setForm] = useState<{ editId?: string | null; initial?: MatchFormState | null } | null>(null);
  const [bulk, setBulk] = useState(false);
  const [actions, setActions] = useState<AdminMatchRow | null>(null);

  const rows = q.data ?? [];
  const days = useMemo(() => [...new Set(rows.map((r) => dayKey(r.summary.scheduledAt)))].sort(), [rows]);
  const today = dayKey(Date.now());

  const filtered = useMemo(() => {
    const t = text.trim().toLowerCase();
    return rows.filter(({ summary: m, mesario }) => {
      if (day && dayKey(m.scheduledAt) !== day) return false;
      if (sportId && m.sportId !== sportId) return false;
      if (status && m.status !== status) return false;
      if (instId && m.homeId !== instId && m.awayId !== instId && !m.participantIds?.includes(instId)) return false;
      if (t) {
        const hay = [m.phase, m.group, m.venue, m.title, sport(m.sportId)?.name, inst(m.homeId)?.name, inst(m.awayId)?.name, mesario?.name].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [rows, day, sportId, status, instId, text, inst, sport]);

  const groups = useMemo(() => {
    const g = new Map<string, AdminMatchRow[]>();
    for (const r of filtered) {
      const k = dayKey(r.summary.scheduledAt);
      g.set(k, [...(g.get(k) ?? []), r]);
    }
    return [...g.entries()];
  }, [filtered]);

  const live = rows.filter((r) => r.summary.status === 'LIVE').length;

  return (
    <div>
      <PageHeader
        title="Jogos"
        subtitle={
          <>
            {rows.length} jogos · {live > 0 && <b className="text-live">{live} ao vivo · </b>}
            {rows.filter((r) => !r.mesario && r.summary.status === 'SCHEDULED').length} sem mesário
          </>
        }
        actions={
          <>
            <Button icon={<ListPlus className="h-4 w-4" />} onClick={() => setBulk(true)}>
              Criar rodada
            </Button>
            <Button variant="brand" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({})}>
              Novo jogo
            </Button>
          </>
        }
      />

      {/* filtros */}
      <div className="mb-4 space-y-2">
        <div className="scroll-x -mx-4 gap-1.5 px-4">
          <DayChip active={!day} onClick={() => setDay('')} top="Todos" bottom={`${rows.length}`} />
          {days.map((d) => {
            const c = dayChip(d, today);
            return <DayChip key={d} active={day === d} onClick={() => setDay(d)} top={c.top} bottom={c.bottom} />;
          })}
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_180px_180px_160px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
            <input className="field pl-9" placeholder="Buscar atlética, local, fase, mesário…" value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <Select value={sportId} onChange={setSportId}>
            <option value="">Todas modalidades</option>
            {sports.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select value={instId} onChange={setInstId}>
            <option value="">Todas atléticas</option>
            {institutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={setStatus}>
            {STATUS_FILTERS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {q.isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : groups.length === 0 ? (
        <div className="card">
          <Empty icon={<ClipboardList className="h-6 w-6" />} title={rows.length ? 'Nada com esses filtros' : 'Nenhum jogo neste torneio'}>
            {rows.length ? 'Limpe algum filtro.' : 'Crie um jogo ou uma rodada inteira.'}
          </Empty>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([d, list]) => (
            <section key={d}>
              <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-mute">
                {longDate(`${d}T12:00:00-03:00`)} <span className="text-mute-2">· {list.length}</span>
              </h2>
              <div className="card divide-y divide-white/[0.05] overflow-hidden">
                {list.map((r) => (
                  <Row key={r.summary.id} r={r} onOpen={() => setActions(r)} onEdit={() => setForm({ editId: r.summary.id })} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <MatchFormSheet open={!!form} onClose={() => setForm(null)} editId={form?.editId} initial={form?.initial} />
      <BulkSheet open={bulk} onClose={() => setBulk(false)} />
      <ActionsSheet
        r={actions}
        onClose={() => setActions(null)}
        onEdit={(id) => {
          setActions(null);
          setForm({ editId: id });
        }}
        onDuplicate={async (id) => {
          setActions(null);
          const m = (await get<any>(`/admin/matches/${id}`)).match;
          setForm({
            initial: {
              tournamentId: m.tournamentId,
              sportId: m.sportId,
              gender: m.gender,
              phase: m.phase ?? '',
              group: m.group ?? '',
              title: m.title ?? '',
              venue: m.venue ?? '',
              when: toLocalInput(new Date(new Date(m.scheduledAt).getTime() + 3600_000).toISOString()),
              homeId: m.homeId ?? '',
              awayId: m.awayId ?? '',
              mesarioId: m.mesarioId ?? '',
              backupMesarioId: m.backupMesarioId ?? '',
              countsForStandings: m.countsForStandings,
              ...splitNotes(m.notes),
              status: 'SCHEDULED',
              participants: (m.participants ?? []).map((p: any) => ({ institutionId: p.institutionId, athleteName: p.athleteName ?? '', lane: p.lane })),
            },
          });
        }}
      />
    </div>
  );
}

function DayChip({ active, onClick, top, bottom }: { active: boolean; onClick: () => void; top: string; bottom: string }) {
  return (
    <button onClick={onClick} className={cx('flex min-w-[64px] shrink-0 flex-col items-center rounded-2xl px-3 py-1.5 transition', active ? 'bg-white text-black' : 'bg-white/[0.05] text-white/75 hover:bg-white/[0.09]')}>
      <span className="text-[12px] font-bold">{top}</span>
      <span className={cx('text-[11px]', active ? 'text-black/60' : 'text-mute')}>{bottom}</span>
    </button>
  );
}

function Row({ r, onOpen, onEdit }: { r: AdminMatchRow; onOpen: () => void; onEdit: () => void }) {
  const m = r.summary;
  return (
    <div className="group flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 hover:bg-white/[0.025]" onClick={onOpen}>
      <span className="w-12 shrink-0 font-display text-[18px] font-bold tabular">{timeHM(m.scheduledAt)}</span>
      <div className="min-w-0 flex-1 basis-60">
        <MatchLine m={m} />
      </div>
      <div className="flex items-center gap-2">
        <StatusPill m={m} />
        {m.manual && <span className="rounded-full bg-pop-blue/10 px-2 py-0.5 text-[10px] font-bold uppercase text-pop-blue">manual</span>}
      </div>
      <div className="flex w-full flex-col items-start leading-tight md:w-44 md:items-end" onClick={(e) => e.stopPropagation()}>
        <StaffButton r={r} role="mesario" />
        <span className="inline-flex items-center">
          <StaffButton r={r} role="backup" className="font-normal text-mute" />
          {r.backupEnabled && <span className="text-[11px] font-semibold text-brand">· liberado</span>}
        </span>
      </div>
      <div className="hidden items-center gap-0.5 sm:flex" onClick={(e) => e.stopPropagation()}>
        <button className="rounded-lg p-1.5 text-mute hover:bg-white/10 hover:text-white" title="Editar" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </button>
        <a className="rounded-lg p-1.5 text-mute hover:bg-white/10 hover:text-white" title="Operar" href={`/mesa/jogo/${m.id}`}>
          <MonitorPlay className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

function ActionsSheet({ r, onClose, onEdit, onDuplicate }: { r: AdminMatchRow | null; onClose: () => void; onEdit: (id: string) => void; onDuplicate: (id: string) => void }) {
  const inv = MATCH_DATA_KEYS;
  const [confirm, setConfirm] = useState<'reset' | 'delete' | null>(null);
  const [result, setResult] = useState(false);
  const [staff, setStaff] = useState<StaffRole | null>(null);
  const id = r?.summary.id ?? '';
  const backup = useAction((en: boolean) => post(`/admin/matches/${id}/backup`, { enabled: en }), { ok: (x: any) => (x.backupEnabled ? 'Reserva liberado' : 'Reserva bloqueado'), invalidate: inv, onDone: onClose });
  const lineups = useAction(() => post<{ imported: number }>(`/admin/matches/${id}/import-lineups`), { ok: (x) => `${x.imported} atleta(s) importado(s) dos elencos`, invalidate: inv });
  const reset = useAction(() => post(`/admin/matches/${id}/reset`), { ok: 'Jogo zerado', invalidate: inv, onDone: () => (setConfirm(null), onClose()) });
  const remove = useAction(() => del(`/admin/matches/${id}`), { ok: 'Jogo excluído', invalidate: inv, onDone: () => (setConfirm(null), onClose()) });
  const clearManual = useAction(() => del(`/admin/matches/${id}/result`), { ok: 'Resultado manual removido', invalidate: inv, onDone: onClose });

  const m = r?.summary;
  const item = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-medium hover:bg-white/[0.06]';
  return (
    <>
      <StaffPicker r={r} role={staff ?? 'mesario'} open={!!staff} onClose={() => (setStaff(null), onClose())} />
      <Sheet open={!!r && !confirm && !result && !staff} onClose={onClose} title="Jogo">
        {m && (
          <div>
            <div className="mb-4 rounded-2xl bg-white/[0.04] p-3">
              <MatchLine m={m} />
              <div className="mt-2 flex items-center gap-2 text-[12px] text-mute">
                <StatusPill m={m} /> {timeHM(m.scheduledAt)} · {m.venue ?? 'sem local'}
              </div>
            </div>
            <div className="grid gap-0.5">
              <button className={item} onClick={() => onEdit(m.id)}>
                <Pencil className="h-4 w-4 text-mute" /> Editar
              </button>
              <button className={item} onClick={() => setStaff('mesario')}>
                <UserPlus className="h-4 w-4 text-mute" /> {r?.mesario ? `Trocar titular (${r.mesario.name})` : 'Escalar mesário titular'}
              </button>
              <button className={item} onClick={() => setStaff('backup')}>
                <UserPlus className="h-4 w-4 text-mute" /> {r?.backup ? `Trocar reserva (${r.backup.name})` : 'Escalar mesário reserva'}
              </button>
              <button className={item} onClick={() => onDuplicate(m.id)}>
                <Copy className="h-4 w-4 text-mute" /> Duplicar
              </button>
              <a className={item} href={`/mesa/jogo/${m.id}`}>
                <MonitorPlay className="h-4 w-4 text-mute" /> Operar no console da mesa
              </a>
              <a className={item} href={`/jogo/${m.id}${m.isSandbox ? '?sandbox=1' : ''}`} target="_blank" rel="noreferrer">
                <Eye className="h-4 w-4 text-mute" /> Ver no site público
              </a>
              {r?.backup && (
                <button className={item} onClick={() => backup.mutate([!r.backupEnabled])}>
                  {r.backupEnabled ? <Lock className="h-4 w-4 text-mute" /> : <LockOpen className="h-4 w-4 text-brand" />}
                  {r.backupEnabled ? `Bloquear reserva (${r.backup.name})` : `Liberar reserva (${r.backup.name}) para registrar`}
                </button>
              )}
              {!m.title && (
                <button className={item} onClick={() => lineups.mutate([])}>
                  <Shirt className="h-4 w-4 text-mute" /> Importar elencos para a escalação
                </button>
              )}
              {!m.score.ranking && (
                <button className={item} onClick={() => setResult(true)}>
                  <Trophy className="h-4 w-4 text-mute" /> {m.manual ? 'Editar resultado manual' : 'Lançar resultado manual'}
                </button>
              )}
              {m.manual && (
                <button className={item} onClick={() => clearManual.mutate([])}>
                  <RotateCcw className="h-4 w-4 text-mute" /> Remover resultado manual
                </button>
              )}
              <div className="my-1 h-px bg-white/[0.06]" />
              <button className={cx(item, 'text-warn')} onClick={() => setConfirm('reset')}>
                <RotateCcw className="h-4 w-4" /> Zerar lances
              </button>
              <button className={cx(item, 'text-live')} onClick={() => setConfirm('delete')}>
                <Trash2 className="h-4 w-4" /> Excluir jogo
              </button>
            </div>
          </div>
        )}
      </Sheet>
      <Confirm open={confirm === 'reset'} onClose={() => setConfirm(null)} title="Zerar todos os lances?" danger hold confirmLabel="Zerar jogo" onConfirm={() => reset.mutate([])}>
        Apaga todos os eventos (gols, cartões, períodos…) e o jogo volta para <b>agendado</b>. Não dá pra desfazer.
      </Confirm>
      <Confirm open={confirm === 'delete'} onClose={() => setConfirm(null)} title="Excluir jogo?" danger hold confirmLabel="Excluir" onConfirm={() => remove.mutate([])}>
        O jogo some do site e da classificação, junto com todos os lances e a escalação.
      </Confirm>
      <ResultSheet open={result} m={m ?? null} onClose={() => (setResult(false), onClose())} />
    </>
  );
}

function ResultSheet({ open, m, onClose }: { open: boolean; m: MatchSummary | null; onClose: () => void }) {
  const { inst } = useAdmin();
  const [home, setHome] = useState<number | null>(null);
  const [away, setAway] = useState<number | null>(null);
  const [winner, setWinner] = useState('');
  const [note, setNote] = useState('');
  const [seeded, setSeeded] = useState<string | null>(null);
  if (open && m && seeded !== m.id) {
    setSeeded(m.id);
    setHome(m.score.home);
    setAway(m.score.away);
    setWinner('');
    setNote('');
  }
  // editando um resultado manual: traz o vencedor (ex.: nos pênaltis) e a observação já lançados
  useEffect(() => {
    if (!open || !m?.manual) return;
    let off = false;
    void get<{ match: { manualResult: { home: number; away: number; winner?: string | null; note?: string | null } | null } }>(`/admin/matches/${m.id}`).then((r) => {
      const mr = r.match.manualResult;
      if (off || !mr) return;
      setHome(mr.home);
      setAway(mr.away);
      setWinner(mr.winner ?? '');
      setNote(mr.note ?? '');
    });
    return () => {
      off = true;
    };
  }, [open, m?.id, m?.manual]);
  const save = useAction(() => put(`/admin/matches/${m!.id}/result`, { home: home ?? 0, away: away ?? 0, winner: winner || null, note: note || null }), {
    ok: 'Resultado lançado',
    invalidate: MATCH_DATA_KEYS,
    onDone: () => (setSeeded(null), onClose()),
  });
  const h = inst(m?.homeId);
  const a = inst(m?.awayId);
  return (
    <Sheet
      open={open}
      onClose={() => (setSeeded(null), onClose())}
      title="Resultado manual"
      footer={
        <Button variant="brand" className="w-full" loading={save.isPending} onClick={() => save.mutate([])}>
          Salvar resultado final
        </Button>
      }
    >
      <p className="mb-4 text-[13px] text-mute">Para jogos sem súmula ao vivo ou correções. O resultado manual vale por cima dos lances e trava o console do mesário até ser removido.</p>
      <div className="flex items-end justify-center gap-4">
        {[
          [h, home, setHome],
          [a, away, setAway],
        ].map(([i, v, set], idx) => (
          <div key={idx} className="flex flex-col items-center gap-2">
            {i ? <TeamFlag inst={i as any} size={56} /> : null}
            <span className="text-[13px] font-semibold">{(i as any)?.name}</span>
            <NumInput value={v as number | null} onChange={set as any} className="w-24 text-center font-display text-[28px] font-bold" step={0.5} min={0} />
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-3">
        <Field label="Vencedor" hint="Deixe automático para decidir pelo placar (use em decisões por pênaltis/WO).">
          <Select value={winner} onChange={setWinner}>
            <option value="">Automático pelo placar ({fmtScore(home ?? 0)} x {fmtScore(away ?? 0)})</option>
            <option value="home">{h?.name ?? 'Mandante'}</option>
            <option value="away">{a?.name ?? 'Visitante'}</option>
            <option value="draw">Empate</option>
          </Select>
        </Field>
        <Field label="Observação">
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: decidido nos pênaltis 4x3" maxLength={200} />
        </Field>
      </div>
    </Sheet>
  );
}
