// Visão geral do dia: alertas, jogos ao vivo (com ações rápidas) e agenda de hoje.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Lock, LockOpen, MonitorPlay, Radio, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cx, Empty, Spinner } from '@/components/ui/primitives';
import { get, post } from '@/lib/api';
import { ADMIN_PATH } from '@/lib/auth';
import { timeHM } from '@/lib/format';
import { useRooms, useSocketEvent } from '@/lib/socket';
import { AdminMatchRow, useAdmin } from './ctx';
import { MatchLine, PageHeader, StatusPill, useAction } from './ui';

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

  const d = q.data;
  const all = d ? [...d.live, ...d.today] : [];
  const byId = new Map(all.map((r) => [r.summary.id, r]));

  return (
    <div>
      <PageHeader title="Visão geral" subtitle={sandbox ? 'Dados do sandbox (isolado do público)' : 'O que está rolando agora e nas próximas horas'} />
      {q.isLoading || !d ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
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

          {d.alerts.length > 0 && (
            <section className="card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3 text-[13px] font-bold uppercase tracking-wider text-amber-300">
                <TriangleAlert className="h-4 w-4" /> {d.alerts.length} alerta{d.alerts.length > 1 ? 's' : ''}
              </div>
              <ul className="divide-y divide-white/[0.05]">
                {d.alerts.map((a, i) => {
                  const r = byId.get(a.matchId);
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <span className={cx('h-2 w-2 shrink-0 rounded-full', a.level === 'danger' ? 'bg-live' : 'bg-amber-400')} />
                      <span className="w-60 shrink-0 text-[13px] font-semibold">{a.message}</span>
                      {r && (
                        <div className="min-w-0 flex-1">
                          <MatchLine m={r.summary} compact />
                        </div>
                      )}
                      <Link to={`${ADMIN_PATH}/jogos`} className="text-[12px] font-semibold text-brand hover:underline">
                        resolver
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

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
                  <LiveCard key={r.summary.id} r={r} onBackup={(en) => backup.mutate([r.summary.id, en])} />
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
                    <StatusPill m={r.summary} />
                    <span className={cx('w-36 truncate text-right text-[12px]', r.mesario ? 'text-mute' : 'font-semibold text-amber-300')}>{r.mesario?.name ?? 'sem mesário'}</span>
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

function LiveCard({ r, onBackup }: { r: AdminMatchRow; onBackup: (enabled: boolean) => void }) {
  const m = r.summary;
  const stale = Date.now() - m.updatedAt > 25 * 60_000;
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <StatusPill m={m} />
        <span className="truncate text-[12px] text-mute">{m.venue}</span>
      </div>
      <MatchLine m={m} />
      {m.lastEvent && (
        <div className={cx('mt-3 truncate rounded-lg bg-white/[0.04] px-3 py-1.5 text-[12px]', stale ? 'text-amber-300' : 'text-white/70')}>
          Último lance: {m.lastEvent.label} · {timeHM(m.lastEvent.at)}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-mute">
          Mesário: <b className="text-white/85">{r.mesario?.name ?? '—'}</b>
          {r.backup && (
            <>
              {' '}
              · reserva <b className="text-white/85">{r.backup.name}</b>
            </>
          )}
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
