// Painel "Bastidores": layout (sidebar no desktop, drawer no celular),
// seletor global de torneio e rotas das telas de gestão.
import { CalendarDays, ExternalLink, FlaskConical, LayoutDashboard, LogOut, Medal, Menu, MonitorPlay, Shield, Shirt, Trophy, UserCog, Dumbbell } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo';
import { cx, Sheet } from '@/components/ui/primitives';
import { ADMIN_PATH, useAuth } from '@/lib/auth';
import Athletes from './Athletes';
import { AdminProvider, useAdmin } from './ctx';
import Dashboard from './Dashboard';
import Institutions from './Institutions';
import Matches from './Matches';
import Sandbox from './Sandbox';
import Scoring from './Scoring';
import Sports from './Sports';
import Team from './Team';
import Tournaments from './Tournaments';
import { SandboxBadge } from './ui';

const NAV = [
  { to: '', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: 'jogos', label: 'Jogos', icon: CalendarDays },
  { to: 'pontuacao', label: 'Pontuação', icon: Medal },
  { to: 'torneios', label: 'Torneios', icon: Trophy },
  { to: 'atleticas', label: 'Atléticas', icon: Shield },
  { to: 'atletas', label: 'Atletas & elencos', icon: Shirt },
  { to: 'modalidades', label: 'Modalidades', icon: Dumbbell },
  { to: 'equipe', label: 'Equipe', icon: UserCog },
  { to: 'sandbox', label: 'Sandbox', icon: FlaskConical },
];

export default function AdminApp() {
  return (
    <AdminProvider>
      <Shell />
    </AdminProvider>
  );
}

function TournamentPicker({ className }: { className?: string }) {
  const { tournaments, tournamentId, setTournamentId, tournament } = useAdmin();
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <select
        value={tournamentId ?? ''}
        onChange={(e) => setTournamentId(e.target.value)}
        className="field h-9 max-w-[240px] truncate py-1 text-[13px] font-semibold"
        aria-label="Torneio"
      >
        {tournaments.map((t) => (
          <option key={t.id} value={t.id}>
            {t.isSandbox ? '🧪 ' : ''}
            {t.name}
            {t.edition ? ` ${t.edition}` : ''}
            {!t.active ? ' (inativo)' : ''}
          </option>
        ))}
      </select>
      {tournament?.isSandbox && <SandboxBadge />}
    </div>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-0.5">
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cx('flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-medium transition', isActive ? 'bg-white text-black' : 'text-white/70 hover:bg-white/[0.06] hover:text-white')
          }
        >
          <n.icon className="h-[18px] w-[18px]" />
          {n.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Shell() {
  const { user, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  const footer = (
    <div className="space-y-1 border-t border-white/[0.06] pt-3">
      <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] text-white/70 hover:bg-white/[0.06] hover:text-white">
        <ExternalLink className="h-4 w-4" /> Ver site público
      </a>
      <a href="/mesa" className="flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] text-white/70 hover:bg-white/[0.06] hover:text-white">
        <MonitorPlay className="h-4 w-4" /> Mesa (operar jogos)
      </a>
      <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] text-white/70 hover:bg-white/[0.06] hover:text-white">
        <LogOut className="h-4 w-4" /> Sair <span className="ml-auto truncate text-[11px] text-mute-2">{user?.name}</span>
      </button>
    </div>
  );

  return (
    <div className="min-h-[100dvh] lg:pl-64">
      {/* sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 border-r border-white/[0.06] bg-ink-900 p-4 lg:flex">
        <div className="px-1 pt-1">
          <Logo size={30} sub="bastidores" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavItems />
        </div>
        {footer}
      </aside>

      {/* topo */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-white/[0.06] bg-ink/85 px-4 backdrop-blur-xl lg:px-8">
        <button className="-ml-1 rounded-lg p-1.5 hover:bg-white/10 lg:hidden" onClick={() => setMenu(true)} aria-label="Menu">
          <Menu className="h-5 w-5" />
        </button>
        <span className="lg:hidden">
          <Logo size={24} />
        </span>
        <TournamentPicker className="ml-auto lg:ml-0" />
      </header>

      <Sheet open={menu} onClose={() => setMenu(false)} title={<Logo size={26} sub="bastidores" />}>
        <NavItems onNavigate={() => setMenu(false)} />
        <div className="mt-4">{footer}</div>
      </Sheet>

      <main key={loc.pathname.split('/')[2] ?? ''} className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="jogos" element={<Matches />} />
          <Route path="pontuacao" element={<Scoring />} />
          <Route path="torneios" element={<Tournaments />} />
          <Route path="atleticas" element={<Institutions />} />
          <Route path="atletas" element={<Athletes />} />
          <Route path="modalidades" element={<Sports />} />
          <Route path="equipe" element={<Team />} />
          <Route path="sandbox" element={<Sandbox />} />
          <Route path="*" element={<Navigate to={ADMIN_PATH} replace />} />
        </Routes>
      </main>
    </div>
  );
}
