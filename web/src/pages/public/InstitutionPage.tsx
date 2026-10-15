import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { StandingsDTO } from '@shared/types';
import { MatchCard } from '@/components/match/MatchCard';
import { Button, cx, Empty } from '@/components/ui/primitives';
import { FlagPatternShapes, TeamFlag } from '@/components/ui/TeamFlag';
import { get } from '@/lib/api';
import { useFeed } from '@/lib/data';
import { alpha, fmtScore, mix, onColor } from '@/lib/format';
import { useFavorites } from '@/lib/hooks';
import { usePublic } from './PublicLayout';

export default function InstitutionPage() {
  const { slug = '' } = useParams();
  const { boot, tournament } = usePublic();
  const inst = boot.institutions.find((i) => i.slug === slug);
  const feed = useFeed(tournament?.id);
  const { isFav, toggle } = useFavorites();
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
  const ink = onColor(mix(inst.primaryColor, '#000', 0.3));
  const fav = isFav(inst.id);

  return (
    <div>
      <div className="relative overflow-hidden px-4 pb-6 pt-8" style={{ background: mix(inst.primaryColor, '#000', 0.4), color: ink }}>
        <svg className="absolute inset-0 h-full w-full opacity-60" viewBox="0 0 150 100" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <FlagPatternShapes pattern={inst.flagPattern} p={inst.primaryColor} s={inst.secondaryColor} a={inst.accentColor} w={150} h={100} />
        </svg>
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${alpha('#000000', 0.15)}, ${alpha('#060708', 0.95)})` }} />
        <div className="relative flex items-end gap-4">
          <TeamFlag inst={inst} size={84} />
          <div className="min-w-0 flex-1 text-white">
            <h1 className="font-display text-[42px] font-extrabold uppercase leading-none">{inst.name}</h1>
            <p className="mt-1 truncate text-[13px] text-white/75">{[inst.fullName, inst.university].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <div className="relative mt-5 flex gap-2">
          <Button size="sm" variant={fav ? 'primary' : 'soft'} icon={<Star className={cx('h-3.5 w-3.5', fav && 'fill-current')} />} onClick={() => toggle(inst.id)}>
            {fav ? 'Seguindo' : 'Seguir'}
          </Button>
          <Link to={`/?atletica=${inst.slug}`}>
            <Button size="sm" variant="soft">
              Todos os jogos <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
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
    <div className="font-display text-[24px] font-bold leading-none tabular">{value}</div>
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
