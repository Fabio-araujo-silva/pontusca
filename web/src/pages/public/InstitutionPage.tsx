import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { StandingsDTO } from '@shared/types';
import { MatchCard } from '@/components/match/MatchCard';
import { Button, cx, Empty } from '@/components/ui/primitives';
import { FlagPatternShapes, TeamFlag } from '@/components/ui/TeamFlag';
import { get } from '@/lib/api';
import { useFeed } from '@/lib/data';
import { alpha, fmtScore } from '@/lib/format';
import { useProfile } from '@/lib/profile';
import { usePublic } from './PublicLayout';

export default function InstitutionPage() {
  const { slug = '' } = useParams();
  const { boot, tournament , setCompactTitle } = usePublic();
  useEffect(() => {
    setCompactTitle(null);
    return () => setCompactTitle(null);
  }, [setCompactTitle]);
  const inst = boot.institutions.find((i) => i.slug === slug);
  const feed = useFeed(tournament?.id);
  const { profile, save } = useProfile();
  const [open, setOpen] = useState<string | null>(null);
  const standings = useQuery({
    queryKey: ['standings', tournament?.id],
    queryFn: () => get<StandingsDTO>(`/public/tournaments/${tournament!.id}/standings`),
    enabled: !!tournament,
  });

  const mine = useMemo(() => (feed.data ?? []).filter((m) => inst && [m.homeId, m.awayId, ...(m.participantIds ?? [])].includes(inst.id)), [feed.data, inst]);
  if (!inst) return <Empty title="Atlética não encontrada" />;

  const live = mine.filter((m) => m.status === 'LIVE');
  const next = mine.filter((m) => m.status === 'SCHEDULED').slice(0, 4);
  const past = mine.filter((m) => m.status === 'FINISHED').reverse().slice(0, 6);
  const row = standings.data?.rows.find((r) => r.institutionId === inst.id);
  const fav = profile.atleticaId === inst.id;

  return (
    <div>
      <div className="relative overflow-hidden px-4 pb-6 pt-8" style={{ background: inst.primaryColor }}>
        <svg className="absolute inset-0 h-full w-full opacity-60" viewBox="0 0 150 100" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <FlagPatternShapes pattern={inst.flagPattern} p={inst.primaryColor} s={inst.secondaryColor} a={inst.accentColor} w={150} h={100} />
        </svg>
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${alpha('#ffffff', 0)} 0%, ${alpha('#ffffff', 0.75)} 55%, #ffffff 100%)` }} />
        <div className="relative flex items-end gap-4">
          <TeamFlag inst={inst} size={84} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[42px] font-bold leading-none uppercase">{inst.name}</h1>
            <p className="mt-1 truncate text-[13px] text-mute">{[inst.fullName, inst.university].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <div className="relative mt-5 flex gap-2">
          <Button size="sm" variant={fav ? 'primary' : 'soft'} icon={<Star className={cx('h-3.5 w-3.5', fav && 'fill-current')} />} onClick={() => save({ atleticaId: fav ? null : inst.id, onlyMine: fav ? false : profile.onlyMine })}>
            {fav ? 'Minha atlética' : 'É a minha atlética'}
          </Button>
        </div>
      </div>

      <div className="px-4">
        {row && (
          <div className="card -mt-2 grid grid-cols-4 divide-x divide-white/[0.06] py-3 text-center">
            <Stat label="Posição" value={`${row.position}º`} />
            <Stat label="Pontos" value={fmtScore(row.points)} />
            <Stat label="Vitórias" value={String(row.wins)} />
            <Stat label="Medalhas" value={String(row.gold + row.silver + row.bronze)} />
          </div>
        )}
        {live.length > 0 && <Block title="Ao vivo" items={live} open={open} setOpen={setOpen} />}
        {next.length > 0 && <Block title="Próximos jogos" items={next} open={open} setOpen={setOpen} />}
        {past.length > 0 && <Block title="Últimos resultados" items={past} open={open} setOpen={setOpen} />}
        {!mine.length && !feed.isLoading && <Empty title="Sem jogos neste torneio" />}
      </div>
    </div>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="font-display text-[24px] font-bold leading-none tabular uppercase">{value}</div>
    <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-mute">{label}</div>
  </div>
);

function Block({ title, items, open, setOpen }: { title: string; items: Parameters<typeof MatchCard>[0]['m'][]; open: string | null; setOpen: (v: string | null) => void }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wider text-mute">{title}</h2>
      <div className="space-y-2.5">
        {items.map((m) => (
          <MatchCard key={m.id} m={m} expanded={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)} />
        ))}
      </div>
    </section>
  );
}
