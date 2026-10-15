// Escala de mesários: seletor rápido por jogo (titular/reserva) e a tela
// "jogos de uma pessoa" (Equipe) pra atribuir vários de uma vez.
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, Check, Search, UserPlus, UserX, X } from 'lucide-react';
import { ReactNode, useMemo, useState } from 'react';
import { Button, cx, Empty, Segmented, Sheet, Spinner, toast } from '@/components/ui/primitives';
import { get, patch, post } from '@/lib/api';
import { timeHM } from '@/lib/format';
import { AdminMatchRow, AdminUser, useAdmin } from './ctx';
import { MatchLine, StatusPill, useAction } from './ui';

export type StaffRole = 'mesario' | 'backup';
const ROLE: Record<StaffRole, string> = { mesario: 'Titular', backup: 'Reserva' };
const INVALIDATE = [['admin', 'matches'], ['admin', 'dashboard'], ['admin', 'users']];

interface StaffResult {
  updated: number;
  warnings: string[];
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit' });

/** Avisos de choque de horário viram toasts informativos depois do "ok". */
function done(r: StaffResult, ok: string) {
  toast.ok(ok);
  r.warnings.forEach((w, i) => setTimeout(() => toast.info(`⚠ ${w}`), 400 + i * 300));
}

/** Pessoas que podem registrar essa modalidade (mesários habilitados + admins). */
export function useEligible(sportId: string) {
  const { users } = useAdmin();
  return useMemo(() => {
    const ok = users.filter((u) => u.active && (u.role === 'ADMIN' || u.sportIds.includes(sportId)));
    return { mesarios: ok.filter((u) => u.role === 'MESARIO'), admins: ok.filter((u) => u.role === 'ADMIN') };
  }, [users, sportId]);
}

// ---------------------------------------------------------------- seletor por jogo

export function StaffPicker({ r, role, open, onClose }: { r: AdminMatchRow | null; role: StaffRole; open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const m = r?.summary;
  const { mesarios, admins } = useEligible(m?.sportId ?? '');
  const current = role === 'mesario' ? r?.mesario : r?.backup;
  const other = role === 'mesario' ? r?.backup : r?.mesario;
  const save = useAction((userId: string | null) => patch<StaffResult>(`/admin/matches/${m!.id}/staff`, role === 'mesario' ? { mesarioId: userId } : { backupMesarioId: userId }), {
    invalidate: INVALIDATE,
    onDone: onClose,
  });
  const pick = (u: AdminUser | null) =>
    save.mutate([u?.id ?? null], { onSuccess: (x) => done(x, u ? `${u.name} é ${ROLE[role].toLowerCase()} do jogo` : `${ROLE[role]} removido`) });

  const filter = (list: AdminUser[]) => list.filter((u) => !q || u.name.toLowerCase().includes(q.toLowerCase()));
  const Person = ({ u }: { u: AdminUser }) => {
    const isCurrent = u.id === current?.id;
    const isOther = u.id === other?.id;
    return (
      <button
        disabled={isCurrent || isOther || save.isPending}
        onClick={() => pick(u)}
        className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.06] disabled:cursor-default disabled:hover:bg-transparent', isOther && 'opacity-40')}
      >
        <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold', isCurrent ? 'bg-brand text-brand-ink' : 'bg-white/[0.07]')}>{isCurrent ? <Check className="h-4 w-4" /> : initials(u.name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{u.name}</span>
          <span className="block truncate text-[12px] text-mute">
            {isOther ? `já é ${role === 'mesario' ? 'reserva' : 'titular'} deste jogo` : `${u.matches} titular · ${u.backupMatches} reserva${u.phone ? ` · ${u.phone}` : ''}`}
          </span>
        </span>
        {isCurrent && <span className="text-[12px] font-semibold text-brand">atual</span>}
      </button>
    );
  };

  return (
    <Sheet open={open && !!m} onClose={onClose} title={`${ROLE[role]} do jogo`}>
      {m && (
        <div>
          <div className="mb-3 rounded-2xl bg-white/[0.04] p-3">
            <MatchLine m={m} compact />
            <div className="mt-1.5 text-[12px] text-mute">
              {day(m.scheduledAt)} · {timeHM(m.scheduledAt)}
              {m.venue ? ` · ${m.venue}` : ''}
            </div>
          </div>
          <label className="mb-2 flex items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2">
            <Search className="h-4 w-4 text-mute" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pessoa" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-mute" />
          </label>
          {save.isPending && (
            <div className="flex justify-center py-2">
              <Spinner />
            </div>
          )}
          {filter(mesarios).length > 0 && <Group title="Mesários habilitados">{filter(mesarios).map((u) => <Person key={u.id} u={u} />)}</Group>}
          {filter(admins).length > 0 && <Group title="Admins">{filter(admins).map((u) => <Person key={u.id} u={u} />)}</Group>}
          {mesarios.length === 0 && <p className="px-3 py-3 text-[13px] text-mute">Nenhum mesário habilitado nesta modalidade. Habilite em Equipe → editar mesário.</p>}
          {current && (
            <button onClick={() => pick(null)} disabled={save.isPending} className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold text-live hover:bg-live/5">
              <UserX className="h-4 w-4" /> Tirar {current.name} do jogo
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-2">
      <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-mute">{title}</div>
      {children}
    </div>
  );
}

/** Nome do responsável que vira botão de trocar (ou "Escalar" quando vazio). */
export function StaffButton({ r, role, className }: { r: AdminMatchRow; role: StaffRole; className?: string }) {
  const [open, setOpen] = useState(false);
  const who = role === 'mesario' ? r.mesario : r.backup;
  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={cx(
          'inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[12px] font-semibold transition',
          who ? 'text-white/80 hover:bg-white/[0.07]' : role === 'mesario' ? 'bg-live/10 text-live hover:bg-live/15' : 'text-mute hover:bg-white/[0.07]',
          className,
        )}
        title={who ? `Trocar ${ROLE[role].toLowerCase()}` : `Escalar ${ROLE[role].toLowerCase()}`}
      >
        {!who && <UserPlus className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{who ? `${role === 'backup' ? 'res. ' : ''}${who.name}` : role === 'mesario' ? 'Escalar mesário' : 'reserva'}</span>
      </button>
      <span onClick={(e) => e.stopPropagation()}>
        <StaffPicker r={r} role={role} open={open} onClose={() => setOpen(false)} />
      </span>
    </>
  );
}

// ---------------------------------------------------------------- jogos de uma pessoa (Equipe)

export function PersonGames({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const { tournamentId, tournament } = useAdmin();
  const q = useQuery({
    queryKey: ['admin', 'matches', tournamentId],
    queryFn: () => get<AdminMatchRow[]>(`/admin/matches?tournamentId=${tournamentId}`),
    enabled: !!user && !!tournamentId,
  });
  const [role, setRole] = useState<StaffRole>('mesario');
  const [only, setOnly] = useState<'free' | 'all'>('free');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const rows = q.data ?? [];
  const mine = rows.filter((r) => user && (r.mesario?.id === user.id || r.backup?.id === user.id));
  const can = (r: AdminMatchRow) => !!user && (user.role === 'ADMIN' || user.sportIds.includes(r.summary.sportId));
  const open = rows.filter(
    (r) =>
      can(r) &&
      (r.summary.status === 'SCHEDULED' || r.summary.status === 'LIVE') &&
      !mine.includes(r) &&
      (only === 'all' || (role === 'mesario' ? !r.mesario : !r.backup)),
  );

  const bulk = useAction((ids: string[], userId: string | null, as: StaffRole) => post<StaffResult>('/admin/matches/staff/bulk', { matchIds: ids, role: as, userId }), { invalidate: INVALIDATE });
  const add = () =>
    bulk.mutate([[...sel], user!.id, role], {
      onSuccess: (r) => {
        done(r, `${user!.name}: ${r.updated} jogo${r.updated === 1 ? '' : 's'} como ${ROLE[role].toLowerCase()}`);
        setSel(new Set());
      },
    });
  const remove = (r: AdminMatchRow) => {
    const as: StaffRole = r.mesario?.id === user!.id ? 'mesario' : 'backup';
    bulk.mutate([[r.summary.id], null, as], { onSuccess: () => toast.ok(`${user!.name} saiu do jogo`) });
  };
  const toggle = (id: string) => setSel((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))));

  return (
    <Sheet
      open={!!user}
      onClose={() => (setSel(new Set()), onClose())}
      wide
      title={user ? `Jogos de ${user.name}` : ''}
      footer={
        sel.size > 0 ? (
          <Button variant="brand" className="w-full" loading={bulk.isPending} onClick={add} icon={<CalendarPlus className="h-4 w-4" />}>
            Escalar como {ROLE[role].toLowerCase()} em {sel.size} jogo{sel.size > 1 ? 's' : ''}
          </Button>
        ) : undefined
      }
    >
      {!tournamentId ? (
        <Empty title="Escolha um torneio no topo do painel" />
      ) : q.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-[12px] text-mute">Torneio: {tournament?.name}. Só aparecem jogos das modalidades em que a pessoa está habilitada.</p>
          <section>
            <h3 className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-mute">Escalado(a) · {mine.length}</h3>
            {mine.length === 0 ? (
              <p className="rounded-xl bg-white/[0.04] px-3 py-3 text-[13px] text-mute">Nenhum jogo ainda. Escolha abaixo.</p>
            ) : (
              <div className="divide-y divide-white/[0.05] rounded-2xl bg-white/[0.03]">
                {mine.map((r) => (
                  <div key={r.summary.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-24 shrink-0 text-[12px] leading-tight text-mute">
                      {day(r.summary.scheduledAt)}
                      <br />
                      <b className="font-display text-[16px] text-white">{timeHM(r.summary.scheduledAt)}</b>
                    </span>
                    <div className="min-w-0 flex-1">
                      <MatchLine m={r.summary} compact />
                    </div>
                    <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', r.mesario?.id === user?.id ? 'bg-white text-black' : 'bg-white/10 text-white/70')}>
                      {r.mesario?.id === user?.id ? 'titular' : 'reserva'}
                    </span>
                    <button onClick={() => remove(r)} disabled={bulk.isPending} className="rounded-lg p-1.5 text-mute hover:bg-white/10 hover:text-live" title="Tirar deste jogo">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="mr-auto text-[12px] font-bold uppercase tracking-wider text-mute">Adicionar jogos</h3>
              <Segmented size="sm" value={role} onChange={(v) => (setRole(v), setSel(new Set()))} options={[{ value: 'mesario', label: 'Titular' }, { value: 'backup', label: 'Reserva' }]} />
              <Segmented size="sm" value={only} onChange={setOnly} options={[{ value: 'free', label: 'Sem ninguém' }, { value: 'all', label: 'Todos' }]} />
            </div>
            {open.length === 0 ? (
              <p className="rounded-xl bg-white/[0.04] px-3 py-3 text-[13px] text-mute">Nenhum jogo agendado {only === 'free' ? `sem ${ROLE[role].toLowerCase()} ` : ''}nas modalidades dessa pessoa.</p>
            ) : (
              <div className="divide-y divide-white/[0.05] rounded-2xl bg-white/[0.03]">
                {open.map((r) => {
                  const on = sel.has(r.summary.id);
                  const taken = role === 'mesario' ? r.mesario : r.backup;
                  return (
                    <label key={r.summary.id} className={cx('flex cursor-pointer items-center gap-3 px-3 py-2 transition', on && 'bg-brand/[0.06]')}>
                      <input type="checkbox" checked={on} onChange={() => toggle(r.summary.id)} className="h-4 w-4 accent-[rgb(var(--brand))]" />
                      <span className="w-24 shrink-0 text-[12px] leading-tight text-mute">
                        {day(r.summary.scheduledAt)}
                        <br />
                        <b className="font-display text-[16px] text-white">{timeHM(r.summary.scheduledAt)}</b>
                      </span>
                      <div className="min-w-0 flex-1">
                        <MatchLine m={r.summary} compact />
                      </div>
                      {taken && <span className="hidden truncate text-[12px] text-mute sm:block">troca {taken.name}</span>}
                      <StatusPill m={r.summary} />
                    </label>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </Sheet>
  );
}
