// Visão geral do dia: alertas (com o responsável à vista), audiência ao vivo,
// jogos ao vivo (com ações rápidas) e agenda de hoje.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Lock, LockOpen, MessageCircle, MonitorPlay, Phone, Radio, TriangleAlert, UserX, Users } from 'lucide-react';
import { ReactNode, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cx, Empty, Spinner } from '@/components/ui/primitives';
import { get, post } from '@/lib/api';
import { ADMIN_PATH } from '@/lib/auth';
import { timeHM } from '@/lib/format';
import { useRooms, useSocketEvent } from '@/lib/socket';
import { AdminMatchRow, useAdmin } from './ctx';
import { StaffButton, StaffPicker, StaffRole } from './Staff';
import { MatchLine, PageHeader, StatusPill, useAction } from './ui';

interface Presence {
  online: number;
  matches: Record<string, { watching: number; open: number }>;
}

interface DashboardData {
  live: AdminMatchRow[];
  today: AdminMatchRow[];
  alerts: { level: 'warn' | 'danger'; matchId: string; message: string }[];
  counts: { mesarios: number; institutions: number; sports: number; matches: number; live: number };
}

export default function Dashboard() {
  const { tournament } = useAdmin();
  const sandbox = !!tournament?.isSandbox;
  const qc = useQueryClient();
  const key = ['admin', 'dashboard', sandbox];
  const q = useQuery({ queryKey: key, queryFn: () => get<DashboardData>(`/admin/dashboard${sandbox ? '?sandbox=1' : ''}`), refetchInterval: 60_000 });
  useRooms([sandbox ? 'feed:sandbox' : 'feed']);
  useSocketEvent('summary', () => qc.invalidateQueries({ queryKey: key }));
  useSocketEvent('feed:changed', () => qc.invalidateQueries({ queryKey: key }));

  const backup = useAction((id: string, enabled: boolean) => post(`/admin/matches/${id}/backup`, { enabled }), {
    ok: (r: any) => (r.backupEnabled ? 'Reserva liberado para registrar' : 'Reserva bloqueado'),
    invalidate: [key],
  });

  // audiência é volátil e barata: consulta a cada 5 s
  const pres = useQuery({ queryKey: ['admin', 'presence', sandbox], queryFn: () => get<Presence>(`/admin/dashboard/presence${sandbox ? '?sandbox=1' : ''}`), refetchInterval: 5_000 });

  const d = q.data;
  const all = d ? [...d.live, ...d.today] : [];
  const byId = new Map(all.map((r) => [r.summary.id, r]));
  // um card por jogo (o mesmo jogo pode ter 2 alertas), os graves primeiro
  const alertGroups = useMemo(() => {
    const m = new Map<string, DashboardData['alerts']>();
    for (const a of d?.alerts ?? []) m.set(a.matchId, [...(m.get(a.matchId) ?? []), a]);
    return [...m.entries()].map(([matchId, alerts]) => ({ matchId, alerts })).sort((a, b) => +b.alerts.some((x) => x.level === 'danger') - +a.alerts.some((x) => x.level === 'danger'));
  }, [d?.alerts]);
  const viewers = (id: string) => pres.data?.matches[id];

  return (
    <div>
      <PageHeader title="Visão geral" subtitle={sandbox ? 'Dados do sandbox (isolado do público)' : 'O que está rolando agora e nas próximas horas'} />
      {q.isLoading || !d ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['No site agora', pres.data?.online ?? '–', 'text-pop-blue'],
              ['Ao vivo', d.counts.live, 'text-live'],
              ['Jogos', d.counts.matches, ''],
              ['Atléticas', d.counts.institutions, ''],
              ['Modalidades', d.counts.sports, ''],
              ['Mesários', d.counts.mesarios, ''],
            ].map(([label, n, c]) => (
              <div key={label as string} className="card px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-mute">{label}</div>
                <div className={cx('mt-0.5 font-display text-[34px] font-extrabold leading-none tabular', c as string)}>{n}</div>
              </div>
            ))}
          </div>

          {alertGroups.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-warn">
                <TriangleAlert className="h-4 w-4" /> {d.alerts.length} alerta{d.alerts.length > 1 ? 's' : ''}
              </h2>
              <div className="space-y-3">
                {alertGroups.map((g) => (
                  <AlertCard key={g.matchId} alerts={g.alerts} r={byId.get(g.matchId)} onBackup={(en) => backup.mutate([g.matchId, en])} />
                ))}
              </div>
            </section>
          )}

          <AudiencePanel p={pres.data} rows={all} />

          <section>
            <h2 className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-mute">
              <Radio className="h-4 w-4 text-live" /> Ao vivo agora
            </h2>
            {d.live.length === 0 ? (
              <div className="card">
                <Empty title="Nenhum jogo ao vivo">Quando um mesário iniciar um jogo ele aparece aqui na hora.</Empty>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {d.live.map((r) => (
                  <LiveCard key={r.summary.id} r={r} v={viewers(r.summary.id)} onBackup={(en) => backup.mutate([r.summary.id, en])} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-mute">Hoje e próximas horas</h2>
            {d.today.length === 0 ? (
              <div className="card">
                <Empty title="Agenda vazia">Cadastre jogos em Jogos.</Empty>
              </div>
            ) : (
              <div className="card divide-y divide-white/[0.05]">
                {d.today.map((r) => (
                  <div key={r.summary.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="w-12 shrink-0 font-display text-[18px] font-bold tabular">{timeHM(r.summary.scheduledAt)}</span>
                    <div className="min-w-0 flex-1">
                      <MatchLine m={r.summary} />
                    </div>
                    <ViewerBadge v={viewers(r.summary.id)} />
                    <StatusPill m={r.summary} />
                    <span className="flex w-40 justify-end">
                      <StaffButton r={r} role="mesario" />
                    </span>
                    <a href={`/mesa/jogo/${r.summary.id}`} className="rounded-lg p-1.5 text-mute hover:bg-white/10 hover:text-white" title="Operar">
                      <MonitorPlay className="h-4 w-4" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function LiveCard({ r, v, onBackup }: { r: AdminMatchRow; v?: Presence['matches'][string]; onBackup: (enabled: boolean) => void }) {
  const m = r.summary;
  const stale = Date.now() - m.updatedAt > 25 * 60_000;
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <StatusPill m={m} />
        <span className="ml-auto truncate text-[12px] text-mute">{m.venue}</span>
        <ViewerBadge v={v} />
      </div>
      <MatchLine m={m} />
      {m.lastEvent && (
        <div className={cx('mt-3 truncate rounded-lg bg-white/[0.04] px-3 py-1.5 text-[12px]', stale ? 'text-amber-300' : 'text-white/70')}>
          Último lance: {m.lastEvent.label} · {timeHM(m.lastEvent.at)}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1 text-mute">
          Mesário: <StaffButton r={r} role="mesario" className="font-bold text-white/85" />
          <StaffButton r={r} role="backup" />
        </span>
        <div className="ml-auto flex gap-1.5">
          {r.backup && (
            <button
              onClick={() => onBackup(!r.backupEnabled)}
              className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold', r.backupEnabled ? 'bg-brand text-brand-ink' : 'bg-white/[0.07] text-white/80 hover:bg-white/[0.12]')}
            >
              {r.backupEnabled ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              {r.backupEnabled ? 'Reserva liberado' : 'Liberar reserva'}
            </button>
          )}
          <a href={`/mesa/jogo/${m.id}`} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-semibold text-black">
            <MonitorPlay className="h-3.5 w-3.5" /> Operar
          </a>
          <a href={`/jogo/${m.id}${m.isSandbox ? '?sandbox=1' : ''}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-white/[0.07] px-2.5 py-1 font-semibold text-white/80 hover:bg-white/[0.12]">
            <Eye className="h-3.5 w-3.5" /> Público
          </a>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- alertas

/** Telefone BR -> links de ligar e WhatsApp (aceita "(16) 99999-0000", "+55 16 ..."). */
function phoneLinks(raw?: string | null) {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  const intl = digits.length <= 11 ? `55${digits}` : digits;
  return { tel: `tel:+${intl}`, wa: `https://wa.me/${intl}` };
}

function AlertCard({ alerts, r, onBackup }: { alerts: DashboardData['alerts']; r?: AdminMatchRow; onBackup: (enabled: boolean) => void }) {
  const danger = alerts.some((a) => a.level === 'danger');
  const [pick, setPick] = useState<StaffRole | null>(null);
  return (
    <div className={cx('card overflow-hidden border-l-4', danger ? 'border-l-live' : 'border-l-warn')}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 pt-3">
        <ul className="min-w-0 flex-1 space-y-0.5">
          {alerts.map((a, i) => (
            <li key={i} className={cx('flex items-center gap-2 text-[14px] font-bold', a.level === 'danger' ? 'text-live' : 'text-warn')}>
              <TriangleAlert className="h-4 w-4 shrink-0" /> {a.message}
            </li>
          ))}
        </ul>
        <Link to={`${ADMIN_PATH}/jogos`} className="shrink-0 pt-0.5 text-[12px] font-semibold text-brand hover:underline">
          abrir em Jogos
        </Link>
      </div>
      {r && (
        <div className="px-4 pt-2">
          <MatchLine m={r.summary} compact />
        </div>
      )}
      <div className="mt-3 grid gap-px border-t border-white/[0.06] bg-white/[0.06] sm:grid-cols-2">
        <Responsible role="Titular" who={r?.mesario ?? null} onPick={r ? () => setPick('mesario') : undefined} />
        <Responsible
          role="Reserva"
          who={r?.backup ?? null}
          onPick={r ? () => setPick('backup') : undefined}
          extra={
            r?.backup ? (
              <button
                onClick={() => onBackup(!r.backupEnabled)}
                className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold', r.backupEnabled ? 'bg-brand text-brand-ink' : 'bg-white/[0.07] text-white/80 hover:bg-white/[0.12]')}
              >
                {r.backupEnabled ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {r.backupEnabled ? 'Liberado' : 'Liberar reserva'}
              </button>
            ) : null
          }
        />
      </div>
      <StaffPicker r={r ?? null} role={pick ?? 'mesario'} open={!!pick} onClose={() => setPick(null)} />
    </div>
  );
}

/** Quem responde pelo jogo, com contato a um toque. */
function Responsible({ role, who, extra, onPick }: { role: string; who: { name: string; phone?: string | null } | null; extra?: ReactNode; onPick?: () => void }) {
  const links = phoneLinks(who?.phone);
  const initials = who
    ? who.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
    : '';
  return (
    <div className="flex items-center gap-3 bg-black px-4 py-3">
      {who ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[14px] font-bold text-black">{initials}</span>
      ) : (
        <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', role === 'Titular' ? 'bg-live/10 text-live' : 'bg-white/[0.06] text-mute')}>
          <UserX className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-mute">Responsável · {role}</div>
        <div className={cx('truncate text-[16px] font-bold', !who && (role === 'Titular' ? 'text-live' : 'font-semibold text-mute'))}>{who?.name ?? (role === 'Titular' ? 'Ninguém escalado' : 'Sem reserva')}</div>
        {who && <div className="truncate text-[12px] text-mute">{who.phone || 'sem telefone cadastrado'}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {extra}
        {onPick && (
          <button
            onClick={onPick}
            className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold', who ? 'bg-white/[0.07] text-white/80 hover:bg-white/[0.12]' : 'bg-white text-black')}
          >
            {who ? 'Trocar' : 'Escalar'}
          </button>
        )}
        {links && (
          <>
            <a href={links.tel} title={`Ligar para ${who!.name}`} className="rounded-full bg-white/[0.07] p-2 text-white/85 hover:bg-white/[0.12]">
              <Phone className="h-4 w-4" />
            </a>
            <a href={links.wa} target="_blank" rel="noreferrer" title={`WhatsApp de ${who!.name}`} className="rounded-full bg-win p-2 text-snow hover:brightness-110">
              <MessageCircle className="h-4 w-4" />
            </a>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- audiência

function ViewerBadge({ v }: { v?: Presence['matches'][string] }) {
  if (!v?.watching) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-pop-blue/10 px-2 py-0.5 text-[12px] font-bold tabular text-pop-blue" title={`${v.watching} na tela · ${v.open} com o jogo aberto`}>
      <Eye className="h-3.5 w-3.5" /> {v.watching}
    </span>
  );
}

/** Ranking dos jogos mais assistidos agora. */
function AudiencePanel({ p, rows }: { p?: Presence; rows: AdminMatchRow[] }) {
  const ranked = rows
    .map((r) => ({ r, v: p?.matches[r.summary.id] ?? { watching: 0, open: 0 } }))
    .filter((x) => x.v.watching > 0)
    .sort((a, b) => b.v.watching - a.v.watching || b.v.open - a.v.open)
    .slice(0, 8);
  const top = ranked[0]?.v.watching ?? 1;
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-mute">
        <Users className="h-4 w-4 text-pop-blue" /> Audiência agora
        <span className="ml-auto text-[11px] font-semibold normal-case tracking-normal">atualiza a cada 5 s · staff não conta</span>
      </h2>
      <div className="card overflow-hidden">
        {!p ? (
          <div className="px-4 py-5 text-[13px] text-mute">Carregando…</div>
        ) : ranked.length === 0 ? (
          <Empty title={p.online ? `${p.online} no site, nenhum jogo na tela` : 'Ninguém no site agora'}>Conta quem está com o card do jogo na tela ou com o jogo aberto.</Empty>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {ranked.map(({ r, v }) => (
              <li key={r.summary.id} className="relative flex items-center gap-3 px-4 py-2.5">
                <span className="absolute inset-y-1 left-0 rounded-r bg-pop-blue/[0.08] transition-[width] duration-500" style={{ width: `${Math.max(4, (v.watching / top) * 100)}%` }} />
                <div className="relative min-w-0 flex-1">
                  <MatchLine m={r.summary} compact />
                </div>
                <div className="relative hidden sm:block">
                  <StatusPill m={r.summary} />
                </div>
                <div className="relative w-28 shrink-0 text-right">
                  <div className="font-display text-[22px] font-bold leading-none tabular">{v.watching}</div>
                  <div className="text-[11px] text-mute">{v.open ? `${v.open} com o jogo aberto` : 'na tela'}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
