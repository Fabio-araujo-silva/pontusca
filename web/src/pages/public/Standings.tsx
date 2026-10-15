// Placar geral do torneio (soma de pontos por atlética) + tabelas por modalidade.
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronDown, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Gender, InstitutionDTO, StandingRow, StandingsDTO } from '@shared/types';
import { cx, Empty, Segmented, Spinner } from '@/components/ui/primitives';
import { SportIcon } from '@/components/ui/SportIcon';
import { TeamFlag } from '@/components/ui/TeamFlag';
import { get } from '@/lib/api';
import { FALLBACK_INST } from '@/lib/data';
import { fmtScore, GENDER, GENDER_SHORT, onColor, teamTone } from '@/lib/format';
import { Chip } from '@/components/ui/Chip';
import { usePublic } from './PublicLayout';

export default function Standings() {
  const { tournament, inst, sport } = usePublic();
  const q = useQuery({
    queryKey: ['standings', tournament?.id],
    queryFn: () => get<StandingsDTO>(`/public/tournaments/${tournament!.id}/standings`),
    enabled: !!tournament,
    staleTime: 10_000,
  });
  const [tab, setTab] = useState<'geral' | 'modalidades'>('geral');

  if (!tournament) return <Empty icon={<Trophy className="h-6 w-6" />} title="Nenhum torneio no ar" />;
  const data = q.data;

  const banner = tournament.banner ? (
    <img src={tournament.banner} alt={`${tournament.name} ${tournament.edition ?? ''}`} className="block w-full rounded-2xl object-cover ring-1 ring-white/[0.08]" style={{ aspectRatio: '16 / 5.6' }} />
  ) : null;

  return (
    <div className="px-4 pt-4">
      {banner &&
        (tournament.bannerLink ? (
          <a href={tournament.bannerLink} target="_blank" rel="noreferrer" className="mb-5 block transition active:scale-[0.99]">
            {banner}
          </a>
        ) : (
          <div className="mb-5">{banner}</div>
        ))}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wider text-mute">Classificação</p>
          <h1 className="font-display text-[34px] font-bold leading-none uppercase">
            {tournament.name} {tournament.edition}
          </h1>
        </div>
      </div>
      <Segmented
        className="mt-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'geral', label: 'Geral' },
          { value: 'modalidades', label: 'Por modalidade' },
        ]}
      />
      {q.isLoading || !data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : tab === 'geral' ? (
        <General rows={data.rows} inst={inst} sport={sport} />
      ) : (
        <Modalities data={data} inst={inst} sport={sport} />
      )}
    </div>
  );
}

function General({ rows, inst, sport }: { rows: StandingRow[]; inst: Map<string, InstitutionDTO>; sport: ReturnType<typeof usePublic>['sport'] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!rows.length) return <Empty icon={<Trophy className="h-6 w-6" />} title="Ainda sem pontos">A classificação começa a andar com o primeiro resultado.</Empty>;
  const podium = rows.slice(0, 3);
  const order = [podium[1], podium[0], podium[2]].filter(Boolean);
  const heights: Record<number, number> = { 1: 132, 2: 100, 3: 78 };
  return (
    <>
      <div className="mt-6 flex items-end justify-center gap-3">
        {order.map((r) => {
          const i = inst.get(r.institutionId) ?? FALLBACK_INST;
          const tone = teamTone(i.primaryColor, i.secondaryColor);
          return (
            <motion.div key={r.institutionId} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: r.position * 0.08 }} className="flex w-[30%] max-w-[150px] flex-col items-center">
              <TeamFlag inst={i} size={r.position === 1 ? 64 : 50} />
              <Link to={`/atletica/${i.slug}`} className="mt-2 max-w-full truncate text-[14px] font-bold hover:underline">
                {i.name}
              </Link>
              <span className="font-display text-[22px] font-bold tabular uppercase">{fmtScore(r.points)}</span>
              <div className="mt-1.5 flex w-full items-start justify-center rounded-t-2xl pt-2 font-display text-[34px] font-extrabold uppercase" style={{ height: heights[r.position] ?? 70, background: `linear-gradient(180deg, ${tone}, ${tone}55)`, color: onColor(tone) }}>
                {r.position}º
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="card mt-0 overflow-hidden rounded-t-none">
        <div className="grid grid-cols-[28px_1fr_repeat(3,30px)_48px] items-center gap-2 border-b border-white/[0.06] px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-mute">
          <span>#</span>
          <span>Atlética</span>
          <span className="flex justify-center"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#ffd60a' }} /></span>
          <span className="flex justify-center"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#d1d5db' }} /></span>
          <span className="flex justify-center"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#d0884f' }} /></span>
          <span className="text-right">Pts</span>
        </div>
        {rows.map((r) => {
          const i = inst.get(r.institutionId) ?? FALLBACK_INST;
          const isOpen = open === r.institutionId;
          return (
            <div key={r.institutionId} className="border-b border-white/[0.04] last:border-0">
              <button onClick={() => setOpen(isOpen ? null : r.institutionId)} className="grid w-full grid-cols-[28px_1fr_repeat(3,30px)_48px] items-center gap-2 px-4 py-2.5 text-left transition hover:bg-white/[0.03]">
                <span className={cx('font-display text-[17px] font-bold', r.position <= 3 ? 'text-white' : 'text-mute')}>{r.position}</span>
                <span className="flex min-w-0 items-center gap-2.5">
                  <TeamFlag inst={i} size={28} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">{i.name}</span>
                    <span className="block truncate text-[11px] text-mute">
                      {r.played} jogos · {r.wins}V {r.draws}E {r.losses}D
                    </span>
                  </span>
                  <ChevronDown className={cx('ml-auto h-3.5 w-3.5 shrink-0 text-mute transition', isOpen && 'rotate-180')} />
                </span>
                <span className="text-center text-[13px] tabular">{r.gold || '·'}</span>
                <span className="text-center text-[13px] tabular">{r.silver || '·'}</span>
                <span className="text-center text-[13px] tabular">{r.bronze || '·'}</span>
                <span className="text-right font-display text-[19px] font-bold tabular uppercase">{fmtScore(r.points)}</span>
              </button>
              {isOpen && (
                <div className="bg-white/[0.02] px-4 pb-3 pt-1">
                  <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-mute">
                    <span>Jogos: {fmtScore(r.matchPoints)}</span>
                    <span>Colocações: {fmtScore(r.placementPoints)}</span>
                    {r.racePoints ? <span>Provas: {fmtScore(r.racePoints)}</span> : null}
                    {r.adjustments ? <span className={r.adjustments < 0 ? 'text-live' : 'text-win'}>Ajustes: {r.adjustments > 0 ? '+' : ''}{fmtScore(r.adjustments)}</span> : null}
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {r.bySport
                      .slice()
                      .sort((a, b) => b.points - a.points)
                      .map((s) => {
                        const sp = sport.get(s.sportId);
                        return (
                          <div key={s.sportId + s.gender} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-1.5 text-[13px]">
                            <SportIcon name={sp?.icon} size={14} className="text-mute" />
                            <span className="truncate">
                              {sp?.name} {GENDER_SHORT[s.gender]}
                            </span>
                            {s.placement && <span className="rounded-md bg-white/10 px-1.5 text-[11px] font-bold">{s.placement}º</span>}
                            <span className="ml-auto font-semibold tabular">{fmtScore(s.points)}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 px-1 text-[12px] text-mute-2">Atualiza sozinho a cada resultado. Critérios de desempate definidos pela organização.</p>
    </>
  );
}

function Modalities({ data, inst, sport }: { data: StandingsDTO; inst: Map<string, InstitutionDTO>; sport: ReturnType<typeof usePublic>['sport'] }) {
  const keys = useMemo(() => {
    const seen = new Map<string, { sportId: string; gender: Gender }>();
    for (const t of data.modalities) seen.set(`${t.sportId}|${t.gender}`, { sportId: t.sportId, gender: t.gender });
    return [...seen.entries()];
  }, [data]);
  const [sel, setSel] = useState<string | null>(null);
  const cur = sel ?? keys[0]?.[0];
  if (!keys.length) return <Empty icon={<Trophy className="h-6 w-6" />} title="Sem tabelas ainda">As tabelas aparecem quando os primeiros jogos terminarem.</Empty>;
  const tables = data.modalities.filter((t) => `${t.sportId}|${t.gender}` === cur).sort((a, b) => (a.group ?? '').localeCompare(b.group ?? ''));
  return (
    <div className="mt-4">
      <div className="scroll-x -mx-4 gap-2 px-4">
        {keys.map(([k, v]) => {
          const sp = sport.get(v.sportId);
          return (
            <Chip key={k} active={k === cur} onClick={() => setSel(k)}>
              <SportIcon name={sp?.icon} size={14} /> {sp?.name} {GENDER_SHORT[v.gender]}
            </Chip>
          );
        })}
      </div>
      {tables.map((t) => (
        <div key={t.group ?? '-'} className="card mt-4 overflow-hidden">
          <div className="flex items-center justify-between px-4 pb-1 pt-3">
            <p className="text-[13px] font-bold uppercase tracking-wider text-mute">
              {t.group ? `Grupo ${t.group}` : `${sport.get(t.sportId)?.name ?? ''} ${GENDER[t.gender]}`}
            </p>
          </div>
          <table className="w-full text-[13px] tabular">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-mute">
                <th className="py-2 pl-4 text-left font-bold">Atlética</th>
                <th className="w-8 text-center font-bold">P</th>
                <th className="w-7 text-center font-bold">J</th>
                <th className="w-7 text-center font-bold">V</th>
                <th className="w-7 text-center font-bold">E</th>
                <th className="w-7 text-center font-bold">D</th>
                <th className="w-10 pr-4 text-right font-bold">SG</th>
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r) => {
                const i = inst.get(r.institutionId) ?? FALLBACK_INST;
                return (
                  <tr key={r.institutionId} className="border-t border-white/[0.04]">
                    <td className="py-2 pl-4">
                      <span className="flex items-center gap-2">
                        <span className="w-4 text-mute">{r.position}</span>
                        <TeamFlag inst={i} size={22} />
                        <span className="truncate font-semibold">{i.name}</span>
                      </span>
                    </td>
                    <td className="text-center font-display text-[16px] font-bold uppercase">{fmtScore(r.points)}</td>
                    <td className="text-center text-white/75">{r.played}</td>
                    <td className="text-center text-white/75">{r.wins}</td>
                    <td className="text-center text-white/75">{r.draws}</td>
                    <td className="text-center text-white/75">{r.losses}</td>
                    <td className="pr-4 text-right text-white/75">{r.diff > 0 ? `+${fmtScore(r.diff)}` : fmtScore(r.diff)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
