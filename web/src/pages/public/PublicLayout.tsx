import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, FlaskConical, Trophy, UserRound, WifiOff, X } from 'lucide-react';
import { createContext, Dispatch, memo, SetStateAction, useContext, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import type { InstitutionDTO, TournamentDTO } from '@shared/types';
import { Celebration } from '@/components/match/Celebration';
import { Onboarding, useSportsInPlay } from '@/components/Onboarding';
import { TeamFlag } from '@/components/ui/TeamFlag';
import { cx, Spinner } from '@/components/ui/primitives';
import { Logo } from '@/components/ui/Logo';
import { Ticker } from '@/components/ui/Ticker';
import { useAudience } from '@/lib/audience';
import { Bootstrap, useBootstrap, useFeedSportIds, useLiveSync } from '@/lib/data';
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
  setFocused: Dispatch<SetStateAction<string | null>>;
  /** texto no centro da barra quando ela encolhe (ex.: HOJE · 15 OUT) */
  setCompactTitle: (t: string | null) => void;
}

const Ctx = createContext<PublicCtx>(null as any);
export const usePublic = () => useContext(Ctx);

export default function PublicLayout() {
  const b = useBootstrap();
  useLiveSync();
  const loc = useLocation();
  const [focused, setFocused] = useState<string | null>(null);
  const [compactTitle, setCompactTitle] = useState<string | null>(null);
  useAudience(focused, SANDBOX);
  // o torneio é definido pelo admin ("torneio do momento"); o público não escolhe
  const tournament = b.data?.tournaments[0] ?? null;
  const { profile, save } = useProfile();
  const [prefsOpen, setPrefsOpen] = useState(false);
  // só os ids das modalidades (string estável): o layout não re-renderiza a cada lance
  const sportIds = useFeedSportIds(tournament?.id);
  const sportsInPlay = useSportsInPlay(b.data?.sports ?? [], sportIds);
  const institutionsInPlay = useMemo(() => (b.data?.institutions ?? []).filter((i) => !i.isSandbox || SANDBOX), [b.data]);
  const mine = profile.atleticaId ? b.inst.get(profile.atleticaId) : undefined;

  useEffect(() => {
    if (tournament) document.title = `${tournament.name}${tournament.edition ? ' ' + tournament.edition : ''} · PONTUSCA`;
  }, [tournament]);

  // contexto estável: mudar de lance/rolar a página não re-renderiza todos os cards
  const ctx = useMemo<PublicCtx | null>(
    () => (b.data ? { boot: b.data, inst: b.inst, sport: b.sport, tournament, focused, setFocused, setCompactTitle } : null),
    [b.data, b.inst, b.sport, tournament, focused],
  );

  if (!ctx)
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        {b.isError ? <p className="text-mute">Não deu pra carregar agora. Tente de novo em instantes.</p> : <Spinner />}
      </div>
    );

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
        {tournament && <TournamentTicker t={tournament} />}
        <Header
          title={compactTitle}
          onHome={loc.pathname === '/'}
          mine={mine}
          onlyMine={profile.onlyMine}
          onToggleMine={() => save({ onlyMine: !profile.onlyMine })}
          onPrefs={() => setPrefsOpen(true)}
        />
        <OfflineBanner />

        <main key={loc.pathname.split('/')[1]}>
          <Outlet />
        </main>

        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.06] bg-ink/95 pt-2 sm:hidden">
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

const TournamentTicker = memo(function TournamentTicker({ t }: { t: TournamentDTO }) {
  return (
    <Ticker
      items={[
        `${t.name}_${t.edition ?? ''}`.replace(/\s+/g, '_').replace(/_$/, ''),
        'placar ao vivo',
        t.city ? t.city.replace(/\s+/g, '_') : '',
        'lance a lance',
        /tusca/i.test(t.name) ? 'sou_tusqueiro' : 'atlética por atlética',
      ]}
    />
  );
});

/**
 * Barra de cima. Altura FIXA: ao recolher só muda opacidade/escala, então o feed
 * não "anda" embaixo do dedo. Isolada pra o estado de rolagem não re-renderizar a página.
 */
function Header({ title, onHome, mine, onlyMine, onToggleMine, onPrefs }: { title: string | null; onHome: boolean; mine?: InstitutionDTO; onlyMine: boolean; onToggleMine: () => void; onPrefs: () => void }) {
  const compact = useScrolled();
  return (
    <header
      className={cx('sticky top-0 z-30 px-4 pb-2.5 pt-[max(env(safe-area-inset-top),10px)] transition-[background-color,box-shadow] duration-300', compact ? 'bg-ink/95 shadow-[0_1px_0_rgb(var(--fg)/0.07)]' : 'bg-ink')}
      style={SANDBOX ? { top: 30 } : undefined}
    >
      <div className="relative flex h-9 items-center justify-between gap-3">
        <NavLink to="/" aria-label="Início" className="origin-left transition-transform duration-300" style={{ transform: compact ? 'scale(0.87)' : undefined }}>
          <Logo size={30} compact={compact} />
        </NavLink>
        {/* barra recolhida: só o contexto da tela no meio */}
        <span
          aria-hidden={!compact}
          className={cx(
            'pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-display text-[17px] uppercase transition-[opacity,transform] duration-300',
            compact && title ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
          )}
        >
          {title}
        </span>
        <div className="flex items-center gap-1.5">
          <nav className="hidden items-center gap-1 sm:flex">
            <TopLink to="/" icon={<CalendarDays className="h-4 w-4" />} label="Jogos" end compact={compact} />
            <TopLink to="/classificacao" icon={<Trophy className="h-4 w-4" />} label="Classificação" compact={compact} />
          </nav>
          {onHome && mine && (
            <button
              role="switch"
              aria-checked={onlyMine}
              onClick={onToggleMine}
              title={onlyMine ? 'Mostrando só os jogos da sua atlética' : 'Mostrar só os jogos da sua atlética'}
              className="flex items-center gap-1.5 rounded-full py-1 pl-2 pr-1 text-[12px] font-semibold text-mute transition-colors hover:text-white"
            >
              <span className={cx('overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300', onlyMine && 'text-white', compact ? 'max-w-0 opacity-0' : 'max-w-[140px] opacity-100')}>Só {mine.name}</span>
              <span className={cx('relative h-5 w-8 rounded-full transition-colors', onlyMine ? 'bg-coal' : 'bg-white/[0.14]')}>
                <motion.span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-snow shadow" animate={{ x: onlyMine ? 12 : 0 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} />
              </span>
            </button>
          )}
          <button
            onClick={onPrefs}
            aria-label="Minhas preferências"
            title="Minhas preferências"
            className="flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-white/[0.1] transition-[box-shadow,transform] duration-300 hover:ring-white/30"
            style={{ transform: compact ? 'scale(0.82)' : undefined }}
          >
            {mine ? <TeamFlag inst={mine} size={30} /> : <UserRound className="h-4 w-4 text-mute" />}
          </button>
        </div>
      </div>
    </header>
  );
}

/** "Reconectando…" só depois de 1,5 s fora (não pisca no carregamento nem em quedas curtas). */
function OfflineBanner() {
  const online = useConnected();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (online) return setShow(false);
    const t = setTimeout(() => setShow(true), 1500);
    return () => clearTimeout(t);
  }, [online]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="pointer-events-none sticky z-20 flex justify-center" style={{ top: SANDBOX ? 94 : 64 }}>
          <div className="mt-1 flex items-center gap-2 rounded-full bg-ink-800 px-3 py-1.5 text-[12px] font-medium text-mute shadow-card ring-1 ring-white/[0.06]">
            <WifiOff className="h-3.5 w-3.5" /> Reconectando ao placar ao vivo…
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TopLink({ to, icon, label, end, compact }: { to: string; icon: JSX.Element; label: string; end?: boolean; compact?: boolean }) {
  return (
    <NavLink to={to} end={end} title={label} className={({ isActive }) => cx('inline-flex h-8 items-center rounded-full text-[13px] font-semibold transition-[padding,gap,background-color,color] duration-300', compact ? 'gap-0 px-2' : 'gap-1.5 px-3', isActive ? 'bg-white text-black' : 'text-white/70 hover:text-white')}>
      {icon}
      <span className={cx('overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300', compact ? 'max-w-0 opacity-0' : 'max-w-[120px] opacity-100')}>{label}</span>
    </NavLink>
  );
}

function TabLink({ to, icon, label, end }: { to: string; icon: JSX.Element; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => cx('flex w-28 flex-col items-center gap-1 text-[11px] font-semibold transition-colors', isActive ? 'text-white' : 'text-mute')}>
      {icon}
      {label}
    </NavLink>
  );
}
