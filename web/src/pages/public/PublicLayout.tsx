import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, FlaskConical, Trophy, WifiOff, X } from 'lucide-react';
import { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import type { TournamentDTO } from '@shared/types';
import { Celebration } from '@/components/match/Celebration';
import { cx, Spinner } from '@/components/ui/primitives';
import { Logo } from '@/components/ui/Logo';
import { Ticker } from '@/components/ui/Ticker';
import { Bootstrap, useBootstrap, useLiveSync } from '@/lib/data';
import { exitSandbox, SANDBOX } from '@/lib/sandbox';
import { useConnected } from '@/lib/socket';

interface PublicCtx {
  boot: Bootstrap;
  inst: ReturnType<typeof useBootstrap>['inst'];
  sport: ReturnType<typeof useBootstrap>['sport'];
  tournament: TournamentDTO | null;
  /** jogo aberto (card expandido/página) recebe a comemoração em tela cheia */
  focused: string | null;
  setFocused: (id: string | null) => void;
}

const Ctx = createContext<PublicCtx>(null as any);
export const usePublic = () => useContext(Ctx);

export default function PublicLayout() {
  const b = useBootstrap();
  useLiveSync();
  const online = useConnected();
  const loc = useLocation();
  const [focused, setFocused] = useState<string | null>(null);
  // o torneio é definido pelo admin ("torneio do momento"); o público não escolhe
  const tournament = b.data?.tournaments[0] ?? null;

  useEffect(() => {
    if (tournament) document.title = `${tournament.name}${tournament.edition ? ' ' + tournament.edition : ''} · Arquibancada`;
  }, [tournament]);

  if (b.isLoading || !b.data)
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        {b.isError ? <p className="text-mute">Não deu pra carregar agora. Tente de novo em instantes.</p> : <Spinner />}
      </div>
    );

  const ctx: PublicCtx = { boot: b.data, inst: b.inst, sport: b.sport, tournament, focused, setFocused };

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
        <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-ink/85 px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)] backdrop-blur-xl" style={SANDBOX ? { top: 30 } : undefined}>
          <div className="flex items-center justify-between gap-3">
            <NavLink to="/" aria-label="Início">
              <Logo size={30} />
            </NavLink>
            <nav className="hidden items-center gap-1 sm:flex">
              <TopLink to="/" icon={<CalendarDays className="h-4 w-4" />} label="Jogos" end />
              <TopLink to="/classificacao" icon={<Trophy className="h-4 w-4" />} label="Classificação" />
            </nav>
          </div>
          {tournament && (
            <div className="mt-2.5 flex items-center gap-2 text-[13px] font-semibold text-mute">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tournament.color ?? '#111114' }} />
              <span className="truncate text-white">
                {tournament.name} {tournament.edition}
              </span>
              {tournament.city && <span className="truncate">· {tournament.city}</span>}
            </div>
          )}
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
    </Ctx.Provider>
  );
}

function TopLink({ to, icon, label, end }: { to: string; icon: JSX.Element; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition', isActive ? 'bg-white text-black' : 'text-white/70 hover:text-white')}>
      {icon}
      {label}
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
