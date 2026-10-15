// Feed público: agenda por dia (ontem, hoje, amanhã...), ao vivo no topo e
// filtros por atlética, modalidade, naipe, status, local e fase — todos na URL
// pra dar pra compartilhar "só os jogos do CAASO".
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { CalendarX2, Check, Search, SlidersHorizontal, Star, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Gender, MatchSummary } from '@shared/types';
import { MatchCard } from '@/components/match/MatchCard';
import { Button, cx, Empty, LiveDot, Sheet } from '@/components/ui/primitives';
import { SectionTag } from '@/components/ui/Ticker';
import { SportIcon } from '@/components/ui/SportIcon';
import { TeamFlag } from '@/components/ui/TeamFlag';
import { useFeed } from '@/lib/data';
import { addDays, dayChip, dayKey, GENDER } from '@/lib/format';
import { useFavorites } from '@/lib/hooks';
import { serverNow } from '@/lib/socket';
import { usePublic } from './PublicLayout';

type StatusFilter = 'live' | 'scheduled' | 'finished';

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

export default function Home() {
  const { tournament, inst, sport, boot } = usePublic();
  const feed = useFeed(tournament?.id);
  const [params, setParams] = useSearchParams();
  const { favs, isFav } = useFavorites();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const today = dayKey(serverNow());
  const matches = feed.data ?? [];

  // ---- filtros (na URL) ----
  const f = {
    inst: list(params.get('atletica')),
    sport: list(params.get('modalidade')),
    g: list(params.get('naipe')) as Gender[],
    st: list(params.get('status')) as StatusFilter[],
    venue: params.get('local') ?? '',
    phase: params.get('fase') ?? '',
    fav: params.get('fav') === '1',
    q: params.get('q') ?? '',
  };
  const slugToInst = useMemo(() => new Map(boot.institutions.map((i) => [i.slug, i])), [boot.institutions]);
  const slugToSport = useMemo(() => new Map(boot.sports.map((s) => [s.slug, s])), [boot.sports]);
  const setParam = (k: string, v: string | string[] | null) => {
    const next = new URLSearchParams(params);
    const val = Array.isArray(v) ? v.join(',') : v;
    if (val) next.set(k, val);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const toggleIn = (k: string, cur: string[], v: string) => setParam(k, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  const activeCount = f.inst.length + f.sport.length + f.g.length + f.st.length + (f.venue ? 1 : 0) + (f.phase ? 1 : 0) + (f.q ? 1 : 0);

  const filtered = useMemo(() => {
    const instIds = new Set(f.inst.map((s) => slugToInst.get(s)?.id).filter(Boolean) as string[]);
    const sportIds = new Set(f.sport.map((s) => slugToSport.get(s)?.id).filter(Boolean) as string[]);
    const q = f.q.trim().toLowerCase();
    return matches.filter((m) => {
      const ids = [m.homeId, m.awayId, ...(m.participantIds ?? [])].filter(Boolean) as string[];
      if (instIds.size && !ids.some((id) => instIds.has(id))) return false;
      if (f.fav && !ids.some((id) => favs.includes(id))) return false;
      if (sportIds.size && !sportIds.has(m.sportId)) return false;
      if (f.g.length && !f.g.includes(m.gender)) return false;
      if (f.st.length) {
        const k: StatusFilter = m.status === 'LIVE' ? 'live' : m.status === 'FINISHED' ? 'finished' : 'scheduled';
        if (!f.st.includes(k)) return false;
      }
      if (f.venue && m.venue !== f.venue) return false;
      if (f.phase && m.phase !== f.phase) return false;
      if (q) {
        const hay = [m.title, m.phase, m.venue, sport.get(m.sportId)?.name, ...ids.map((id) => inst.get(id)?.name), ...ids.map((id) => inst.get(id)?.university)].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [matches, params, favs, slugToInst, slugToSport, inst, sport]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- dias ----
  const days = useMemo(() => {
    const set = new Set(matches.map((m) => dayKey(m.scheduledAt)));
    if (tournament?.startsAt && tournament?.endsAt) {
      let k = dayKey(tournament.startsAt);
      const end = dayKey(tournament.endsAt);
      for (let i = 0; i < 30 && k <= end; i++, k = addDays(k, 1)) set.add(k);
    }
    set.add(today);
    return [...set].sort();
  }, [matches, tournament, today]);
  const perDay = useMemo(() => {
    const map = new Map<string, { n: number; live: boolean }>();
    for (const m of filtered) {
      const k = dayKey(m.scheduledAt);
      const v = map.get(k) ?? { n: 0, live: false };
      v.n++;
      if (m.status === 'LIVE') v.live = true;
      map.set(k, v);
    }
    return map;
  }, [filtered]);

  const dParam = params.get('dia');
  const defaultDay = useMemo(() => {
    if (perDay.get(today)?.n) return today;
    const next = days.find((d) => d > today && perDay.get(d)?.n);
    const prev = [...days].reverse().find((d) => d < today && perDay.get(d)?.n);
    return next ?? prev ?? today;
  }, [days, perDay, today]);
  const day = dParam && days.includes(dParam) ? dParam : defaultDay;

  const live = filtered.filter((m) => m.status === 'LIVE');
  const ofDay = filtered.filter((m) => dayKey(m.scheduledAt) === day && m.status !== 'LIVE');
  const upcoming = ofDay.filter((m) => m.status === 'SCHEDULED');
  const done = ofDay.filter((m) => m.status === 'FINISHED').sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  const off = ofDay.filter((m) => m.status === 'POSTPONED' || m.status === 'CANCELED');
  const showLive = live.length > 0 && (day === today || live.some((m) => dayKey(m.scheduledAt) === day));

  const venues = useMemo(() => [...new Set(matches.map((m) => m.venue).filter(Boolean) as string[])].sort(), [matches]);
  const phases = useMemo(() => [...new Set(matches.map((m) => m.phase).filter(Boolean) as string[])], [matches]);
  const sportsHere = useMemo(() => {
    const ids = new Set(matches.map((m) => m.sportId));
    return boot.sports.filter((s) => ids.has(s.id));
  }, [matches, boot.sports]);
  const instsHere = useMemo(() => {
    const ids = new Set(matches.flatMap((m) => [m.homeId, m.awayId, ...(m.participantIds ?? [])]).filter(Boolean) as string[]);
    return boot.institutions.filter((i) => ids.has(i.id));
  }, [matches, boot.institutions]);

  if (!tournament) return <Empty icon={<CalendarX2 className="h-6 w-6" />} title="Nenhum torneio no ar">Assim que a organização publicar a tabela, os jogos aparecem aqui.</Empty>;

  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id));
  const section = (title: string, items: MatchSummary[], tone: Parameters<typeof SectionTag>[0]['tone'], tilt = 0) =>
    items.length > 0 && (
      <section className="mt-6">
        <h2 className="mb-2.5 flex items-center gap-2">
          <SectionTag tone={tone} tilt={tilt}>
            {tone === 'live' && <span className="h-2 w-2 animate-pulse rounded-full bg-snow" />}
            {title}
          </SectionTag>
          <span className="font-display text-[17px] text-mute-2">{items.length}</span>
        </h2>
        <div className="space-y-2.5">
          {items.map((m) => (
            <MatchCard key={m.id} m={m} expanded={open === m.id} onToggle={() => toggle(m.id)} />
          ))}
        </div>
      </section>
    );

  return (
    <div className="px-4">
      <DateStrip days={days} today={today} day={day} perDay={perDay} onPick={(d) => setParam('dia', d === defaultDay ? null : d)} />

      <div className="scroll-x -mx-4 mt-3 gap-2 px-4">
        <Chip active={!activeCount && !f.fav} onClick={() => setParams(new URLSearchParams(dParam ? { dia: dParam } : {}), { replace: true })}>
          Todos
        </Chip>
        <Chip active={f.st.length === 1 && f.st[0] === 'live'} onClick={() => setParam('status', f.st.length === 1 && f.st[0] === 'live' ? null : 'live')}>
          <LiveDot /> Ao vivo
        </Chip>
        <Chip active={f.fav} onClick={() => setParam('fav', f.fav ? null : '1')}>
          <Star className={cx('h-3.5 w-3.5', f.fav && 'fill-current')} /> Minhas atléticas
        </Chip>
        <Chip active={activeCount > 0} onClick={() => setFiltersOpen(true)}>
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filtros{activeCount ? ` · ${activeCount}` : ''}
        </Chip>
        {f.inst.map((s) => {
          const i = slugToInst.get(s);
          return i ? (
            <Chip key={s} active onClick={() => toggleIn('atletica', f.inst, s)}>
              <TeamFlag inst={i} size={16} /> {i.name} <X className="h-3 w-3" />
            </Chip>
          ) : null;
        })}
        {f.sport.map((s) => {
          const sp = slugToSport.get(s);
          return sp ? (
            <Chip key={s} active onClick={() => toggleIn('modalidade', f.sport, s)}>
              <SportIcon name={sp.icon} size={14} /> {sp.name} <X className="h-3 w-3" />
            </Chip>
          ) : null;
        })}
      </div>

      {f.fav && !favs.length && <p className="mt-4 rounded-2xl bg-white/[0.04] p-3 text-[13px] text-mute">Você ainda não segue nenhuma atlética. Abra Filtros e toque na ★ das suas.</p>}

      {feed.isLoading ? (
        <div className="mt-5 space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-[132px] rounded-[22px]" />
          ))}
        </div>
      ) : (
        <LayoutGroup>
          {showLive && section('Ao vivo', live, 'live', -1.5)}
          {section('Próximos', upcoming, 'orange', 1)}
          {section('Encerrados', done, 'black', -1)}
          {section('Adiados ou cancelados', off, 'purple')}
          {!showLive && !ofDay.length && (
            <Empty icon={<CalendarX2 className="h-6 w-6" />} title={activeCount || f.fav ? 'Nenhum jogo com esses filtros neste dia' : 'Sem jogos neste dia'}>
              {(() => {
                const nxt = days.find((d) => d > day && perDay.get(d)?.n);
                return nxt ? (
                  <button className="mt-2 font-semibold text-brand" onClick={() => setParam('dia', nxt)}>
                    Ver {dayChip(nxt, today).top.toLowerCase()} ({dayChip(nxt, today).bottom})
                  </button>
                ) : null;
              })()}
            </Empty>
          )}
        </LayoutGroup>
      )}

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtros"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setParams(new URLSearchParams(dParam ? { dia: dParam } : {}), { replace: true })}>
              Limpar
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setFiltersOpen(false)}>
              Ver {filtered.length} jogo{filtered.length === 1 ? '' : 's'}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
            <input className="field pl-10" placeholder="Buscar atlética, local, prova…" value={f.q} onChange={(e) => setParam('q', e.target.value || null)} />
          </label>

          <FilterGroup title="Atléticas" hint="★ = seguir (aparece em Minhas atléticas)">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {instsHere.map((i) => (
                <InstToggle key={i.id} name={i.name} sub={i.university} active={f.inst.includes(i.slug)} fav={isFav(i.id)} onClick={() => toggleIn('atletica', f.inst, i.slug)} instId={i.id} flag={<TeamFlag inst={i} size={28} />} />
              ))}
            </div>
          </FilterGroup>

          <FilterGroup title="Modalidade">
            <div className="flex flex-wrap gap-2">
              {sportsHere.map((s) => (
                <Chip key={s.id} active={f.sport.includes(s.slug)} onClick={() => toggleIn('modalidade', f.sport, s.slug)}>
                  <SportIcon name={s.icon} size={14} /> {s.name}
                </Chip>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup title="Naipe">
            <div className="flex flex-wrap gap-2">
              {(['M', 'F', 'X'] as Gender[]).map((g) => (
                <Chip key={g} active={f.g.includes(g)} onClick={() => toggleIn('naipe', f.g, g)}>
                  {GENDER[g]}
                </Chip>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup title="Situação">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['live', 'Ao vivo'],
                  ['scheduled', 'Agendados'],
                  ['finished', 'Encerrados'],
                ] as [StatusFilter, string][]
              ).map(([k, l]) => (
                <Chip key={k} active={f.st.includes(k)} onClick={() => toggleIn('status', f.st, k)}>
                  {l}
                </Chip>
              ))}
            </div>
          </FilterGroup>

          {venues.length > 1 && (
            <FilterGroup title="Local">
              <div className="flex flex-wrap gap-2">
                {venues.map((v) => (
                  <Chip key={v} active={f.venue === v} onClick={() => setParam('local', f.venue === v ? null : v)}>
                    {v}
                  </Chip>
                ))}
              </div>
            </FilterGroup>
          )}

          {phases.length > 1 && (
            <FilterGroup title="Fase">
              <div className="flex flex-wrap gap-2">
                {phases.map((p) => (
                  <Chip key={p} active={f.phase === p} onClick={() => setParam('fase', f.phase === p ? null : p)}>
                    {p}
                  </Chip>
                ))}
              </div>
            </FilterGroup>
          )}
        </div>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------- peças

function DateStrip({ days, today, day, perDay, onPick }: { days: string[]; today: string; day: string; perDay: Map<string, { n: number; live: boolean }>; onPick: (d: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-day="${day}"]`);
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [day]);
  return (
    <div ref={ref} className="scroll-x -mx-4 mt-3 gap-1.5 px-4">
      {days.map((d) => {
        const c = dayChip(d, today);
        const info = perDay.get(d);
        const active = d === day;
        return (
          <button key={d} data-day={d} onClick={() => onPick(d)} className={cx('relative flex min-w-[64px] shrink-0 flex-col items-center rounded-2xl px-2.5 pb-2 pt-1.5 transition', active ? 'text-black' : 'text-white/80 hover:bg-white/[0.05]')}>
            {active && <motion.span layoutId="day-pill" className="absolute inset-0 rounded-2xl bg-white" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
            <span className={cx('relative font-display text-[17px] uppercase leading-tight', !active && c.diff === 0 && 'text-pop-orange')}>{c.top}</span>
            <span className={cx('relative text-[11px] font-medium', active ? 'text-black/60' : 'text-mute')}>{c.bottom}</span>
            <span className="relative mt-1 h-1.5">
              {info?.live ? <LiveDot className="scale-75" /> : info?.n ? <span className={cx('block h-1.5 w-1.5 rounded-full', active ? 'bg-black/50' : 'bg-white/40')} /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cx('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1 transition active:scale-95', active ? 'bg-white text-black ring-white' : 'bg-white/[0.04] text-white/85 ring-white/[0.08] hover:bg-white/[0.08]')}>
      {children}
    </button>
  );
}

function FilterGroup({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="label mb-0">{title}</p>
        {hint && <span className="text-[11px] text-mute-2">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function InstToggle({ name, sub, active, fav, onClick, instId, flag }: { name: string; sub?: string | null; active: boolean; fav: boolean; onClick: () => void; instId: string; flag: JSX.Element }) {
  const { toggle } = useFavorites();
  return (
    <div className={cx('flex items-center gap-2 rounded-2xl p-2 ring-1 transition', active ? 'bg-white/[0.1] ring-white/40' : 'ring-white/[0.07] hover:bg-white/[0.04]')}>
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {flag}
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold">{name}</span>
          {sub && <span className="block truncate text-[11px] text-mute">{sub}</span>}
        </span>
        <AnimatePresence>{active && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Check className="h-4 w-4 text-brand" /></motion.span>}</AnimatePresence>
      </button>
      <button onClick={() => toggle(instId)} aria-label={fav ? 'Deixar de seguir' : 'Seguir'} className="p-1">
        <Star className={cx('h-4 w-4', fav ? 'fill-warn text-warn' : 'text-mute-2')} />
      </button>
    </div>
  );
}
