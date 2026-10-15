import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, ChevronDown, FlaskConical, Trophy, WifiOff, X } from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import type { TournamentDTO } from '@shared/types';
import { Celebration } from '@/components/match/Celebration';
import { cx, Sheet, Spinner } from '@/components/ui/primitives';
import { Logo } from '@/components/ui/Logo';
import { Bootstrap, useBootstrap, useLiveSync } from '@/lib/data';
import { dayKey } from '@/lib/format';
import { exitSandbox, SANDBOX } from '@/lib/sandbox';
import { useConnected } from '@/lib/socket';

const T_KEY = 'arq.tournament';

interface PublicCtx {
  boot: Bootstrap;
  inst: ReturnType<typeof useBootstrap>['inst'];
  sport: ReturnType<typeof useBootstrap>['sport'];
  tournament: TournamentDTO | null;
  setTournament: (id: string) => void;
  /** jogo aberto (card expandido/página) recebe a comemoração em tela cheia */
  focused: string | null;
  setFocused: (id: string | null) => void;
}

const Ctx = createContext<PublicCtx>(null as any);
export const usePublic = () => useContext(Ctx);

/** Torneio "do momento": o que está rolando hoje, senão o próximo, senão o mais recente. */
function pickDefault(ts: TournamentDTO[]) {
  const today = dayKey(Date.now());
  const running = ts.find((t) => t.startsAt && t.endsAt && dayKey(t.startsAt) <= today && today <= dayKey(t.endsAt));
  if (running) return running;
  const upcoming = ts.filter((t) => t.startsAt && dayKey(t.startsAt) > today).sort((a, b) => a.startsAt!.localeCompare(b.startsAt!))[0];
  return upcoming ?? ts[0] ?? null;
}

export default function PublicLayout() {
  const b = useBootstrap();
  useLiveSync();
  const online = useConnected();
  const loc = useLocation();
  const [tid, setTid] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SANDBOX ? `${T_KEY}.sb` : T_KEY);
    } catch {
      return null;
    }
  });
  const [focused, setFocused] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);

  const tournament = useMemo(() => {
    const ts = b.data?.tournaments ?? [];
    return ts.find((t) => t.id === tid) ?? pickDefault(ts);
  }, [b.data, tid]);

  const setTournament = (id: string) => {
    setTid(id);
    try {
      localStorage.setItem(SANDBOX ? `${T_KEY}.sb` : T_KEY, id);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (tournament) document.title = `${tournament.name}${tournament.edition ? ' ' + tournament.edition : ''} · Arquibancada`;
  }, [tournament]);

  if (b.isLoading || !b.data)
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        {b.isError ? <p className="text-mute">Não deu pra carregar agora. Tente de novo em instantes.</p> : <Spinner />}
      </div>
    );

  const ctx: PublicCtx = { boot: b.data, inst: b.inst, sport: b.sport, tournament, setTournament, focused, setFocused };

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
          <button onClick={() => setPicker(true)} className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-white/[0.06] py-1.5 pl-2 pr-3 text-[13px] font-semibold ring-1 ring-white/[0.06] transition hover:bg-white/[0.1]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tournament?.color ?? '#d7ff3e' }} />
            <span className="truncate">{tournament ? `${tournament.name}${tournament.edition ? ' ' + tournament.edition : ''}` : 'Nenhum torneio ativo'}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-mute" />
          </button>
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

      <Sheet open={picker} onClose={() => setPicker(false)} title="Torneio">
        <div className="space-y-1.5">
          {ctx.boot.tournaments.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTournament(t.id);
                setPicker(false);
              }}
              className={cx('flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition', t.id === tournament?.id ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]')}
            >
              <span className="h-9 w-9 shrink-0 rounded-xl" style={{ background: `linear-gradient(135deg, ${t.color ?? '#d7ff3e'}, #15161a)` }} />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold">
                  {t.name} {t.edition}
                </span>
                <span className="block text-[12px] text-mute">{[t.city, t.startsAt && new Date(t.startsAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          ))}
          {!ctx.boot.tournaments.length && <p className="py-6 text-center text-mute">Nenhum torneio publicado ainda.</p>}
        </div>
      </Sheet>

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
