import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ClipboardList, Lock, LogOut, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { MatchSummary } from '@shared/types';
import { cx, Empty, IconButton, LiveBadge, Spinner } from '@/components/ui/primitives';
import { Logo } from '@/components/ui/Logo';
import { SportIcon } from '@/components/ui/SportIcon';
import { TeamFlag } from '@/components/ui/TeamFlag';
import { get } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FALLBACK_INST, useBootstrap } from '@/lib/data';
import { dayKey, fmtScore, GENDER, longDate, timeHM } from '@/lib/format';
import { useRooms, useSocketEvent } from '@/lib/socket';
import type { MesaListItem } from './types';

function MatchRow({ item, boot }: { item: MesaListItem; boot: ReturnType<typeof useBootstrap> }) {
  const s = item.summary;
  const sport = boot.sport.get(s.sportId);
  const home = item.home ?? ((s.homeId && boot.inst.get(s.homeId)) || FALLBACK_INST);
  const away = item.away ?? ((s.awayId && boot.inst.get(s.awayId)) || FALLBACK_INST);
  const locked = !item.canOperate;
  const live = s.status === 'LIVE';
  const showScore = s.status !== 'SCHEDULED' && !s.title;
  return (
    <Link to={`/mesa/jogo/${s.id}`} className={cx('card block p-4 transition active:scale-[0.99]', live && 'ring-live/40')}>
      <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-mute">
        <SportIcon name={sport?.icon} size={15} className="text-white/70" />
        <span className="truncate text-white/80">
          {sport?.name ?? 'Modalidade'} · {GENDER[s.gender]}
        </span>
        {s.isSandbox && <span className="rounded bg-warn/20 px-1.5 text-[10px] font-bold uppercase text-warn">sandbox</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {item.role === 'primary' && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Titular</span>}
          {item.role === 'backup' && <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn">Reserva</span>}
          {live ? <LiveBadge>{s.live.shortLabel || 'Ao vivo'}</LiveBadge> : s.status === 'FINISHED' ? <span className="text-[11px] font-bold uppercase">Final</span> : <span className="text-[13px] font-bold text-white">{timeHM(s.scheduledAt)}</span>}
        </span>
      </div>
      {s.title ? (
        <div className="font-display text-[22px] font-bold uppercase">{s.title}</div>
      ) : (
        <div className="space-y-2">
          {[
            [home, s.score.home, 'home'],
            [away, s.score.away, 'away'],
          ].map(([inst, score, side]) => (
            <div key={side as string} className="flex items-center gap-3">
              <TeamFlag inst={inst as typeof home} size={28} />
              <span className={cx('flex-1 truncate text-[16px] font-semibold', s.winner && s.winner !== side && s.winner !== 'draw' && 'text-white/50')}>{(inst as typeof home).name}</span>
              {showScore && <span className="font-display text-[26px] font-extrabold tabular uppercase">{fmtScore(score as number)}</span>}
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2 text-[12px] text-mute">
        {s.venue && (
          <span className="inline-flex min-w-0 items-center gap-1 truncate">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {s.venue}
          </span>
        )}
        {locked && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-semibold text-warn">
            <Lock className="h-3.5 w-3.5" /> aguardando liberação do admin
          </span>
        )}
        {!locked && <ChevronRight className="ml-auto h-4 w-4 shrink-0" />}
      </div>
    </Link>
  );
}

const groupOf = (s: MatchSummary, today: string) => {
  if (s.status === 'LIVE') return 'live';
  if (s.status === 'FINISHED' || s.status === 'CANCELED') return 'done';
  const k = dayKey(s.scheduledAt);
  return k <= today ? 'today' : 'next';
};

const TITLES: Record<string, string> = { live: 'Ao vivo', today: 'Hoje', next: 'Próximos', done: 'Encerrados recentes' };

export default function MesaHome() {
  const { user, logout } = useAuth();
  const boot = useBootstrap();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['mesa', 'matches'], queryFn: () => get<MesaListItem[]>('/mesa/matches'), refetchInterval: 60_000 });
  useRooms(['ops', 'ops:sandbox', 'mesa']);
  useSocketEvent<{ summary: MatchSummary }>('summary', ({ summary }) => {
    qc.setQueryData<MesaListItem[]>(['mesa', 'matches'], (list) => list?.map((it) => (it.summary.id === summary.id ? { ...it, summary } : it)));
  });
  useSocketEvent('staff:changed', () => qc.invalidateQueries({ queryKey: ['mesa', 'matches'] }));
  useSocketEvent('feed:changed', () => qc.invalidateQueries({ queryKey: ['mesa', 'matches'] }));

  const today = dayKey(Date.now());
  const groups = new Map<string, MesaListItem[]>();
  for (const it of q.data ?? []) {
    const g = groupOf(it.summary, today);
    groups.set(g, [...(groups.get(g) ?? []), it]);
  }
  groups.get('done')?.reverse();

  return (
    <div className="mx-auto min-h-[100dvh] max-w-2xl px-4 pb-16">
      <header className="flex items-center justify-between py-4">
        <Logo size={30} sub="mesa" />
        <div className="flex items-center gap-2">
          <div className="text-right leading-tight">
            <div className="text-[13px] font-semibold">{user?.name}</div>
            <div className="text-[11px] text-mute">{user?.role === 'ADMIN' ? 'admin' : 'mesário'}</div>
          </div>
          <IconButton label="Sair" onClick={logout}>
            <LogOut className="h-5 w-5" />
          </IconButton>
        </div>
      </header>
      <h1 className="mb-1 mt-2 font-display text-[34px] font-bold leading-none uppercase">Meus jogos</h1>
      <p className="mb-5 text-[13px] text-mute">
        {longDate(Date.now())}. Abra o jogo e mantenha esta tela com você na quadra.
      </p>
      {q.isLoading && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}
      {q.data && !q.data.length && (
        <Empty icon={<ClipboardList className="h-6 w-6" />} title="Nenhum jogo escalado pra você">
          Quando o admin te colocar como mesário (titular ou reserva) de um jogo, ele aparece aqui.
        </Empty>
      )}
      {(['live', 'today', 'next', 'done'] as const).map((g) =>
        groups.get(g)?.length ? (
          <section key={g} className="mb-6">
            <h2 className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-mute">
              {g === 'live' && <span className="h-2 w-2 rounded-full bg-live" />}
              {TITLES[g]} · {groups.get(g)!.length}
            </h2>
            <div className="space-y-2.5">
              {groups.get(g)!.map((it) => (
                <MatchRow key={it.summary.id} item={it} boot={boot} />
              ))}
            </div>
          </section>
        ) : null,
      )}
    </div>
  );
}
