import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, FlaskConical, Trophy, UserRound, WifiOff, X } from 'lucide-react';
import { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import type { TournamentDTO } from '@shared/types';
import { Celebration } from '@/components/match/Celebration';
import { Onboarding, useSportsInPlay } from '@/components/Onboarding';
import { TeamFlag } from '@/components/ui/TeamFlag';
import { cx, Spinner } from '@/components/ui/primitives';
import { Logo } from '@/components/ui/Logo';
import { Ticker } from '@/components/ui/Ticker';
import { useAudience } from '@/lib/audience';
import { Bootstrap, useBootstrap, useFeed, useLiveSync } from '@/lib/data';
import { useProfile } from '@/lib/profile';
import { exitSandbox, SANDBOX } from '@/lib/sandbox';
import { useConnected } from '@/lib/socket';
import { useScrolled } from '@/lib/hooks';

interface PublicCtx {
  boot: Bootstrap;
  inst: ReturnType<typeof useBootstrap>['inst'];
  sport: ReturnType<typeof useBootstrap>['sport'];
  tournament: TournamentDTO | null;
  /** jogo aberto (card expandido/página) recebe a comemoração em tela cheia */
  focused: string | null;
  setFocused: (id: string | null) => void;
  /** texto no centro da barra quando ela encolhe (ex.: HOJE · 15 OUT) */
  setCompactTitle: (t: string | null) => void;
}

const Ctx = createContext<PublicCtx>(null as any);
export const usePublic = () => useContext(Ctx);

export default function PublicLayout() {
  const b = useBootstrap();
  useLiveSync();
  const online = useConnected();
  const loc = useLocation();
  const [focused, setFocused] = useState<string | null>(null);
  const [compactTitle, setCompactTitle] = useState<string | null>(null);
  const compact = useScrolled();
  useAudience(focused, SANDBOX);
  // o torneio é definido pelo admin ("torneio do momento"); o público não escolhe
  const tournament = b.data?.tournaments[0] ?? null;
  const { profile, save } = useProfile();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const feed = useFeed(tournament?.id);
  const sportsInPlay = useSportsInPlay(b.data?.sports ?? [], [...new Set((feed.data ?? []).map((m) => m.sportId))]);
  const institutionsInPlay = (b.data?.institutions ?? []).filter((i) => !i.isSandbox || SANDBOX);
  const mine = profile.atleticaId ? b.inst.get(profile.atleticaId) : undefined;
  const onHome = loc.pathname === '/';

  useEffect(() => {
    if (tournament) document.title = `${tournament.name}${tournament.edition ? ' ' + tournament.edition : ''} · PONTUSCA`;
  }, [tournament]);

  if (b.isLoading || !b.data)
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        {b.isError ? <p className="text-mute">Não deu pra carregar agora. Tente de novo em instantes.</p> : <Spinner />}
      </div>
    );

  const ctx: PublicCtx = { boot: b.data, inst: b.inst, sport: b.sport, tournament, focused, setFocused, setCompactTitle };

  return (
    <Ctx.Provider value={ctx}>
      <div className="mx-auto min-h-[100dvh] max-w-[760px] pb-24 sm:pb-10">
        {SANDBOX && (
          <div className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-warn px-4 py-1.5 text-[12px] font-bold uppercase tracking-wider text-black">
            <span className="inline-flex items-center gap-1.5">
              <FlaskConical className="h-3.5 w-3.5" /> Modo sandbox · dados de teste
            </span>
            <button onClick={exitSandbox} className="inline-flex items-center gap-1 rounded-full bg-black/10 px-2 py-0.5 hover:bg-black/20">
              Sair <X className="h-3 w-3" />
            </button>
          </div>
        )}
        {tournament && (
          <Ticker
            items={[
              `${tournament.name}_${tournament.edition ?? ''}`.replace(/\s+/g, '_').replace(/_$/, ''),
              'placar ao vivo',
              tournament.city ? tournament.city.replace(/\s+/g, '_') : '',
              'lance a lance',
              /tusca/i.test(tournament.name) ? 'sou_tusqueiro' : 'atlética por atlética',
            ]}
          />
        )}
        <header
          className={cx(
            'sticky top-0 z-30 px-4 backdrop-blur-xl transition-[padding,background-color,box-shadow] duration-300',
            compact ? 'bg-ink/80 pb-2 pt-[max(env(safe-area-inset-top),8px)] shadow-[0_1px_0_rgb(var(--fg)/0.07)]' : 'bg-ink/95 pb-3 pt-[max(env(safe-area-inset-top),12px)]',
          )}
          style={SANDBOX ? { top: 30 } : undefined}
        >
          <div className="relative flex items-center justify-between gap-3">
            <NavLink to="/" aria-label="Início">
              <Logo size={compact ? 26 : 30} compact={compact} />
            </NavLink>
            {/* barra recolhida: só o contexto da tela no meio */}
            <span
              aria-hidden={!compact}
              className={cx(
                'pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-display text-[17px] uppercase transition-all duration-300',
                compact && compactTitle ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
              )}
            >
              {compactTitle}
            </span>
            <div className="flex items-center gap-1.5">
              <nav className="hidden items-center gap-1 sm:flex">
                <TopLink to="/" icon={<CalendarDays className="h-4 w-4" />} label="Jogos" end compact={compact} />
                <TopLink to="/classificacao" icon={<Trophy className="h-4 w-4" />} label="Classificação" compact={compact} />
              </nav>
              {onHome && mine && (
                <button
                  role="switch"
                  aria-checked={profile.onlyMine}
                  onClick={() => save({ onlyMine: !profile.onlyMine })}
                  title={profile.onlyMine ? 'Mostrando só os jogos da sua atlética' : 'Mostrar só os jogos da sua atlética'}
                  className="flex items-center gap-1.5 rounded-full py-1 pl-2 pr-1 text-[12px] font-semibold text-mute transition hover:text-white"
                >
                  <span className={cx('overflow-hidden whitespace-nowrap transition-all duration-300', profile.onlyMine && 'text-white', compact ? 'max-w-0 opacity-0' : 'max-w-[140px] opacity-100')}>Só {mine.name}</span>
                  <span className={cx('relative h-5 w-8 rounded-full transition-colors', profile.onlyMine ? 'bg-coal' : 'bg-white/[0.14]')}>
                    <motion.span className="absolute top-0.5 h-4 w-4 rounded-full bg-snow shadow" animate={{ left: profile.onlyMine ? 14 : 2 }} transition={{ type: 'spring', stiffness: 600, damping: 34 }} />
                  </span>
                </button>
              )}
              <button onClick={() => setPrefsOpen(true)} aria-label="Minhas preferências" title="Minhas preferências" className={cx('flex items-center justify-center rounded-full ring-1 ring-white/[0.1] transition-all duration-300 hover:ring-white/30', compact ? 'h-7 w-7' : 'h-9 w-9')}>
                {mine ? <TeamFlag inst={mine} size={compact ? 24 : 30} /> : <UserRound className="h-4 w-4 text-mute" />}
              </button>
            </div>
          </div>
        </header>

        <AnimatePresence>
          {!online && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="flex items-center justify-center gap-2 bg-ink-800 py-1.5 text-[12px] font-medium text-mute">
                <WifiOff className="h-3.5 w-3.5" /> Reconectando ao placar ao vivo…
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <main key={loc.pathname.split('/')[1]}>
          <Outlet />
        </main>

        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.06] bg-ink/90 pt-2 backdrop-blur-xl sm:hidden">
          <div className="mx-auto flex max-w-sm justify-around">
            <TabLink to="/" icon={<CalendarDays className="h-[22px] w-[22px]" />} label="Jogos" end />
            <TabLink to="/classificacao" icon={<Trophy className="h-[22px] w-[22px]" />} label="Classificação" />
          </div>
        </nav>
      </div>


      <Celebration />
      <AnimatePresence>
        {(!profile.onboarded || prefsOpen) && (
          <Onboarding key="onb" institutions={institutionsInPlay} sports={sportsInPlay} editing={profile.onboarded} onClose={() => setPrefsOpen(false)} />
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

function TopLink({ to, icon, label, end, compact }: { to: string; icon: JSX.Element; label: string; end?: boolean; compact?: boolean }) {
  return (
    <NavLink to={to} end={end} title={label} className={({ isActive }) => cx('inline-flex items-center rounded-full py-1.5 text-[13px] font-semibold transition-all duration-300', compact ? 'gap-0 px-2' : 'gap-1.5 px-3', isActive ? 'bg-white text-black' : 'text-white/70 hover:text-white')}>
      {icon}
      <span className={cx('overflow-hidden whitespace-nowrap transition-all duration-300', compact ? 'max-w-0 opacity-0' : 'max-w-[120px] opacity-100')}>{label}</span>
    </NavLink>
  );
}

function TabLink({ to, icon, label, end }: { to: string; icon: JSX.Element; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => cx('flex w-28 flex-col items-center gap-1 text-[11px] font-semibold transition', isActive ? 'text-white' : 'text-mute')}>
      {icon}
      {label}
    </NavLink>
  );
}
