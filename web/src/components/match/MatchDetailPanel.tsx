// Conteúdo expandido do card: lance a lance, escalações, números e info.
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Clock3, ExternalLink, Link2, MapPin, Share2, Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { InstitutionDTO, MatchDetail, MatchSummary, PlayerView, SportDTO, TimelineItem } from '@shared/types';
import { usePublic } from '@/pages/public/PublicLayout';
import { get } from '@/lib/api';
import { alpha, fmtScore, longDate, onColor, teamTone, timeHM, visibleOnDark } from '@/lib/format';
import { Button, cx, Segmented, toast } from '../ui/primitives';
import { TeamFlag } from '../ui/TeamFlag';
import { teamsOf } from './helpers';
import { ShareSheet } from './ShareSheet';
import { TimelineIcon } from './TimelineIcon';

type Tab = 'lances' | 'escalacoes' | 'numeros' | 'resultado' | 'info';

export function useMatchDetail(id: string, summary?: MatchSummary) {
  return useQuery({
    queryKey: ['match', id],
    queryFn: () => get<MatchDetail>(`/public/matches/${id}`),
    staleTime: 15_000,
    placeholderData: (prev) => prev ?? (summary ? ({ ...summary, timeline: [], lineups: { home: [], away: [] }, stats: [] } as MatchDetail) : undefined),
  });
}

export function MatchDetailPanel({ id, summary, page }: { id: string; summary?: MatchSummary; page?: boolean }) {
  const { inst, sport, tournament, setFocused } = usePublic();
  const q = useMatchDetail(id, summary);
  const d = q.data;
  const [share, setShare] = useState(false);
  const sp = d ? sport.get(d.sportId) : undefined;

  useEffect(() => {
    setFocused(id);
    return () => setFocused(null);
  }, [id, setFocused]);

  const tabs = useMemo(() => {
    if (!d) return [] as { value: Tab; label: string }[];
    const t: { value: Tab; label: string }[] = [];
    if (d.score.ranking) t.push({ value: 'resultado', label: 'Resultado' });
    else {
      t.push({ value: 'lances', label: d.score.periods.length && sp?.engine === 'SETS' ? 'Sets' : 'Lances' });
      if (d.lineups.home.length || d.lineups.away.length) t.push({ value: 'escalacoes', label: 'Escalações' });
      if (d.stats.length || d.score.periods.length || d.score.baseball) t.push({ value: 'numeros', label: 'Números' });
    }
    t.push({ value: 'info', label: 'Info' });
    return t;
  }, [d, sp]);
  const [tab, setTab] = useState<Tab | null>(null);
  const active = tab && tabs.some((t) => t.value === tab) ? tab : tabs[0]?.value;

  if (!d) return <div className="space-y-2 px-4 pb-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-10" />)}</div>;
  const teams = teamsOf(d, inst);

  return (
    <div className={cx('border-t border-white/[0.06] pb-4', page && 'border-0')}>
      <div className="flex items-center gap-2 px-4 pt-3">
        <div className="scroll-x -mx-1 flex-1 px-1">
          <Segmented size="sm" value={active ?? 'info'} onChange={setTab} options={tabs} />
        </div>
        {(d.status === 'FINISHED' || d.status === 'LIVE') && (
          <Button size="sm" variant="primary" icon={<Share2 className="h-3.5 w-3.5" />} onClick={() => setShare(true)}>
            Compartilhar
          </Button>
        )}
      </div>

      <div className="mt-3 px-4">
        {active === 'lances' && <TimelineView d={d} teams={teams} sp={sp} />}
        {active === 'escalacoes' && <Lineups d={d} teams={teams} />}
        {active === 'numeros' && <Numbers d={d} teams={teams} sp={sp} />}
        {active === 'resultado' && <RankingTable d={d} inst={inst} sp={sp} />}
        {active === 'info' && <Info d={d} tournamentName={tournament ? `${tournament.name} ${tournament.edition ?? ''}` : ''} page={page} />}
      </div>

      <ShareSheet open={share} onClose={() => setShare(false)} m={d} sport={sp} />
    </div>
  );
}

// ---------------------------------------------------------------- lance a lance

const LIFECYCLE = new Set(['MATCH_START', 'PERIOD_START', 'PERIOD_END', 'MATCH_END', 'SHOOTOUT_START', 'WO']);

function TimelineView({ d, teams, sp }: { d: MatchDetail; teams: { home: InstitutionDTO; away: InstitutionDTO }; sp?: SportDTO }) {
  const [minor, setMinor] = useState(false);
  const minorCount = d.timeline.filter((t) => t.minor).length;
  const items = [...d.timeline].filter((t) => minor || !t.minor).reverse();
  const isSets = sp?.engine === 'SETS' || sp?.engine === 'TENNIS';

  if (!d.timeline.length) return <p className="py-6 text-center text-[13px] text-mute">{d.status === 'SCHEDULED' ? 'O lance a lance aparece aqui assim que a bola rolar.' : 'Sem lances registrados.'}</p>;

  return (
    <div>
      {isSets && d.score.periods.length > 0 && <SetsStrip d={d} teams={teams} />}
      {minorCount > 0 && (
        <button onClick={() => setMinor((v) => !v)} className="mb-2 text-[12px] font-semibold text-brand">
          {minor ? 'Esconder lances miúdos' : `Mostrar ponto a ponto (${minorCount})`}
        </button>
      )}
      <ol className="relative space-y-1">
        {items.map((t) => (LIFECYCLE.has(t.type) || t.icon === 'set' || t.icon === 'inning' ? <Divider key={t.id} t={t} /> : <Row key={t.id} t={t} teams={teams} sportIcon={sp?.icon} />))}
      </ol>
    </div>
  );
}

function Divider({ t }: { t: TimelineItem }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="h-px flex-1 bg-white/[0.07]" />
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white/70">
        <TimelineIcon icon={t.icon} size={12} />
        {t.title}
        {t.minute && <span className="text-mute">· {t.minute}</span>}
      </span>
      <span className="h-px flex-1 bg-white/[0.07]" />
    </li>
  );
}

function Row({ t, teams, sportIcon }: { t: TimelineItem; teams: { home: InstitutionDTO; away: InstitutionDTO }; sportIcon?: string }) {
  const away = t.side === 'away';
  const neutral = !t.side;
  const team = t.side ? teams[t.side] : null;
  const tone = team ? visibleOnDark(teamTone(team.primaryColor, team.secondaryColor)) : '#8e8e93';
  return (
    <li className={cx('flex items-center gap-3 rounded-2xl px-2 py-2', away && 'flex-row-reverse text-right', neutral && 'justify-center text-center', t.minor && 'py-1 opacity-70')}>
      <span className="w-[66px] shrink-0 whitespace-nowrap font-display text-[15px] font-semibold tabular text-mute">{t.minute ?? ''}</span>
      <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', t.important ? 'bg-white/[0.1]' : 'bg-white/[0.04]')} style={t.important && team ? { boxShadow: `inset 0 0 0 1.5px ${alpha(tone, 0.8)}` } : undefined}>
        <TimelineIcon icon={t.icon} sportIcon={sportIcon} size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block truncate text-[14px]', t.important ? 'font-bold' : 'font-medium')}>{t.title}</span>
        {t.subtitle && <span className="block truncate text-[12px] text-mute">{t.subtitle}</span>}
      </span>
      {t.scoreAfter && t.important && (
        <span className="shrink-0 rounded-lg bg-white/[0.07] px-2 py-0.5 font-display text-[15px] font-bold tabular">
          {fmtScore(t.scoreAfter[0])}–{fmtScore(t.scoreAfter[1])}
        </span>
      )}
    </li>
  );
}

function SetsStrip({ d, teams }: { d: MatchDetail; teams: { home: InstitutionDTO; away: InstitutionDTO } }) {
  const tb = d.score.tennis?.tiebreaks ?? [];
  return (
    <div className="mb-3 overflow-x-auto rounded-2xl bg-white/[0.04] p-3">
      <table className="w-full text-[14px] tabular">
        <tbody>
          {(['home', 'away'] as const).map((side, r) => (
            <tr key={side}>
              <td className="py-1 pr-3">
                <span className="flex items-center gap-2 font-semibold">
                  <TeamFlag inst={teams[side]} size={20} />
                  {teams[side].name}
                </span>
              </td>
              {d.score.periods.map((p, i) => {
                const won = p[r] > p[1 - r];
                return (
                  <td key={i} className={cx('px-2 text-center font-display text-[18px] font-bold', !won && 'text-white/40')}>
                    {fmtScore(p[r])}
                    {tb[i] && <sup className="ml-0.5 text-[10px] text-mute">{tb[i]![r]}</sup>}
                  </td>
                );
              })}
              {d.score.tennis && d.status === 'LIVE' && <td className="pl-3 text-center font-display text-[18px] font-bold text-brand">{d.score.tennis.game[r]}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- escalações

function Lineups({ d, teams }: { d: MatchDetail; teams: { home: InstitutionDTO; away: InstitutionDTO } }) {
  const [side, setSide] = useState<'home' | 'away'>('home');
  return (
    <div>
      <div className="mb-3 sm:hidden">
        <Segmented size="sm" value={side} onChange={setSide} options={[{ value: 'home', label: teams.home.name }, { value: 'away', label: teams.away.name }]} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(['home', 'away'] as const).map((s) => (
          <div key={s} className={cx(s !== side && 'hidden sm:block')}>
            <div className="mb-2 hidden items-center gap-2 sm:flex">
              <TeamFlag inst={teams[s]} size={22} />
              <span className="font-semibold">{teams[s].name}</span>
            </div>
            <PlayerList players={d.lineups[s]} inst={teams[s]} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerList({ players, inst }: { players: PlayerView[]; inst: InstitutionDTO }) {
  if (!players.length) return <p className="py-4 text-[13px] text-mute">Escalação ainda não divulgada.</p>;
  const starters = players.filter((p) => p.starter);
  const bench = players.filter((p) => !p.starter);
  const tone = teamTone(inst.primaryColor, inst.secondaryColor);
  const Item = ({ p }: { p: PlayerView }) => (
    <li className="flex items-center gap-3 py-1.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-display text-[15px] font-bold" style={{ background: tone, color: onColor(tone) }}>
        {p.number ?? '·'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium">
          {p.nickname ? (
            <>
              {p.nickname} <span className="text-mute">· {p.name}</span>
            </>
          ) : (
            p.name
          )}
        </span>
        {p.course && <span className="block truncate text-[11px] text-mute">{p.course}</span>}
      </span>
      {p.captain && <span className="rounded-md bg-brand px-1.5 text-[10px] font-black text-brand-ink">C</span>}
      {p.position && <span className="w-9 text-right text-[11px] font-semibold text-mute">{p.position}</span>}
    </li>
  );
  return (
    <div>
      {starters.length > 0 && (
        <>
          <p className="label">Titulares</p>
          <ul className="mb-3 divide-y divide-white/[0.04]">{starters.map((p) => <Item key={p.athleteId} p={p} />)}</ul>
        </>
      )}
      {bench.length > 0 && (
        <>
          <p className="label">{starters.length ? 'Reservas' : 'Inscritos'}</p>
          <ul className="divide-y divide-white/[0.04]">{bench.map((p) => <Item key={p.athleteId} p={p} />)}</ul>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- números

function periodHeaders(d: MatchDetail, sp?: SportDTO) {
  const cfg = sp?.config;
  return d.score.periods.map((_, i) => {
    const n = i + 1;
    if (cfg?.engine === 'SETS' || cfg?.engine === 'TENNIS') return `${(cfg.sets?.label ?? 'Set')[0]}${n}`;
    const reg = cfg?.periods?.count ?? 2;
    if (n > reg) return cfg?.overtime?.short ?? 'PR';
    const s = cfg?.periods?.short ?? 'T';
    return ['Q', 'P', 'R'].includes(s) ? `${s}${n}` : `${n}${s}`;
  });
}

function Numbers({ d, teams, sp }: { d: MatchDetail; teams: { home: InstitutionDTO; away: InstitutionDTO }; sp?: SportDTO }) {
  const hc = visibleOnDark(teamTone(teams.home.primaryColor, teams.home.secondaryColor));
  const ac = visibleOnDark(teamTone(teams.away.primaryColor, teams.away.secondaryColor));
  const heads = periodHeaders(d, sp);
  return (
    <div className="space-y-5">
      {d.score.baseball && <Linescore d={d} teams={teams} sp={sp} />}
      {!d.score.baseball && d.score.periods.length > 0 && (
        <div className="overflow-x-auto rounded-2xl bg-white/[0.04] p-3">
          <table className="w-full text-[13px] tabular">
            <thead>
              <tr className="text-mute">
                <th className="pb-1 text-left font-semibold" />
                {heads.map((h, i) => (
                  <th key={i} className="px-1.5 pb-1 text-center font-semibold">
                    {h}
                  </th>
                ))}
                <th className="pb-1 pl-2 text-center font-semibold text-white">{sp?.engine === 'SETS' ? 'Sets' : 'Total'}</th>
              </tr>
            </thead>
            <tbody>
              {(['home', 'away'] as const).map((s, r) => (
                <tr key={s}>
                  <td className="py-1 pr-2">
                    <span className="flex items-center gap-2 font-semibold">
                      <TeamFlag inst={teams[s]} size={18} />
                      {teams[s].name}
                    </span>
                  </td>
                  {d.score.periods.map((p, i) => (
                    <td key={i} className="px-1.5 text-center text-white/80">
                      {fmtScore(p[r])}
                    </td>
                  ))}
                  <td className="pl-2 text-center font-display text-[17px] font-bold">{fmtScore(r === 0 ? d.score.home : d.score.away)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d.stats.length > 0 && (
        <div className="space-y-3.5">
          {d.stats.map((s) => {
            const total = s.home + s.away || 1;
            return (
              <div key={s.label}>
                <div className="mb-1 flex items-center justify-between text-[13px]">
                  <span className="font-display text-[17px] font-bold tabular">{fmtScore(s.home)}</span>
                  <span className="font-medium text-white/70">{s.label}</span>
                  <span className="font-display text-[17px] font-bold tabular">{fmtScore(s.away)}</span>
                </div>
                <div className="flex h-1.5 gap-1">
                  <div className="flex flex-1 justify-end overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full" style={{ width: `${(s.home / total) * 100}%`, background: hc, opacity: s.home >= s.away ? 1 : 0.55 }} />
                  </div>
                  <div className="flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full" style={{ width: `${(s.away / total) * 100}%`, background: ac, opacity: s.away >= s.home ? 1 : 0.55 }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Linescore({ d, teams, sp }: { d: MatchDetail; teams: { home: InstitutionDTO; away: InstitutionDTO }; sp?: SportDTO }) {
  const b = d.score.baseball!;
  const n = Math.max(sp?.config.baseball?.innings ?? 9, b.innings.away.length, b.innings.home.length);
  const cols = Array.from({ length: n }, (_, i) => i);
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl bg-white/[0.04] p-3">
        <table className="w-full text-[13px] tabular">
          <thead>
            <tr className="text-mute">
              <th />
              {cols.map((i) => (
                <th key={i} className={cx('px-1 pb-1 text-center font-semibold', d.status === 'LIVE' && b.inning === i + 1 && 'text-brand')}>
                  {i + 1}
                </th>
              ))}
              <th className="pl-2 text-center font-bold text-white">R</th>
              <th className="px-1 text-center font-semibold">H</th>
              <th className="px-1 text-center font-semibold">E</th>
            </tr>
          </thead>
          <tbody>
            {(['away', 'home'] as const).map((s) => (
              <tr key={s}>
                <td className="py-1 pr-2">
                  <span className="flex items-center gap-2 font-semibold">
                    <TeamFlag inst={teams[s]} size={18} />
                    {teams[s].name}
                  </span>
                </td>
                {cols.map((i) => (
                  <td key={i} className="px-1 text-center text-white/80">
                    {b.innings[s][i] ?? ''}
                  </td>
                ))}
                <td className="pl-2 text-center font-display text-[17px] font-bold">{s === 'home' ? d.score.home : d.score.away}</td>
                <td className="px-1 text-center text-white/80">{b.hits[s]}</td>
                <td className="px-1 text-center text-white/80">{b.errors[s]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d.status === 'LIVE' && (
        <div className="flex items-center justify-center gap-8 rounded-2xl bg-white/[0.04] py-3">
          <Diamond bases={b.bases} />
          <div className="space-y-1 text-[12px] font-semibold text-mute">
            <Count label="B" n={b.balls} max={4} color="#34c759" />
            <Count label="S" n={b.strikes} max={3} color="#ffcc00" />
            <Count label="O" n={b.outs} max={3} color="#ff3b30" />
          </div>
          <div className="font-display text-[22px] font-bold">
            {b.half === 'top' ? '▲' : '▼'} {b.inning}ª
          </div>
        </div>
      )}
    </div>
  );
}

export function Diamond({ bases, size = 64 }: { bases: [boolean, boolean, boolean]; size?: number }) {
  const sq = (x: number, y: number, on: boolean) => <rect x={x - 9} y={y - 9} width={18} height={18} transform={`rotate(45 ${x} ${y})`} fill={on ? '#111114' : 'transparent'} stroke={on ? '#111114' : 'rgba(17,17,20,.35)'} strokeWidth={2.5} rx={2} />;
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 80 60" aria-label="bases">
      {sq(40, 14, bases[1])}
      {sq(62, 36, bases[0])}
      {sq(18, 36, bases[2])}
    </svg>
  );
}

function Count({ label, n, max, color }: { label: string; n: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-3">{label}</span>
      {Array.from({ length: max - (label === 'B' ? 1 : 1) }, (_, i) => (
        <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: i < n ? color : 'rgb(var(--fg) / .12)' }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- ranking

function RankingTable({ d, inst, sp }: { d: MatchDetail; inst: Map<string, InstitutionDTO>; sp?: SportDTO }) {
  const rows = d.score.ranking ?? [];
  const medal = ['#ffd60a', '#d1d5db', '#d0884f'];
  return (
    <div>
      <div className="mb-2 flex justify-between text-[11px] font-semibold uppercase tracking-wider text-mute">
        <span>Atleta</span>
        <span>{sp?.config.ranking?.resultLabel ?? 'Marca'}</span>
      </div>
      <ol className="divide-y divide-white/[0.05]">
        {rows.map((r) => {
          const i = inst.get(r.institutionId);
          return (
            <li key={r.participantId} className="flex items-center gap-3 py-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-black" style={{ background: r.position ? (medal[r.position - 1] ?? 'rgb(var(--fg) / .08)') : 'rgb(var(--fg) / .05)', color: r.position && r.position <= 3 ? '#000' : '#fff' }}>
                {r.position ?? '–'}
              </span>
              {i && <TeamFlag inst={i} size={26} />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{r.athleteName ?? i?.name}</span>
                <span className="block truncate text-[12px] text-mute">
                  {i?.name}
                  {r.lane != null && ` · raia ${r.lane}`}
                </span>
              </span>
              <span className={cx('font-display text-[18px] font-bold tabular', !r.result && 'text-mute')}>{r.result ?? '—'}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- info

function Info({ d, tournamentName, page }: { d: MatchDetail; tournamentName: string; page?: boolean }) {
  const url = `${window.location.origin}/jogo/${d.id}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.ok('Link copiado');
    } catch {
      toast.err('Não deu pra copiar');
    }
  };
  return (
    <div className="space-y-3 text-[14px]">
      <InfoRow icon={<CalendarDays className="h-4 w-4" />} text={longDate(d.scheduledAt)} />
      <InfoRow icon={<Clock3 className="h-4 w-4" />} text={timeHM(d.scheduledAt)} />
      {d.venue && <InfoRow icon={<MapPin className="h-4 w-4" />} text={d.venue} />}
      {tournamentName && <InfoRow icon={<Trophy className="h-4 w-4" />} text={[tournamentName.trim(), d.phase, d.group && `Grupo ${d.group}`].filter(Boolean).join(' · ')} />}
      {d.notes && <p className="rounded-2xl bg-white/[0.04] p-3 text-[13px] text-white/75">{d.notes}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" icon={<Link2 className="h-3.5 w-3.5" />} onClick={copy}>
          Copiar link
        </Button>
        {!page && (
          <Link to={`/jogo/${d.id}`}>
            <Button size="sm" variant="outline" icon={<ExternalLink className="h-3.5 w-3.5" />}>
              Abrir página do jogo
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

const InfoRow = ({ icon, text }: { icon: JSX.Element; text: string }) => (
  <div className="flex items-center gap-3 text-white/85">
    <span className="text-mute">{icon}</span>
    {text}
  </div>
);
