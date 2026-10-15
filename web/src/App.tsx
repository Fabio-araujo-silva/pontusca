import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './components/Login';
import { Spinner } from './components/ui/primitives';
import { ADMIN_PATH } from './lib/auth';

const PublicLayout = lazy(() => import('./pages/public/PublicLayout'));
const Home = lazy(() => import('./pages/public/Home'));
const MatchPage = lazy(() => import('./pages/public/MatchPage'));
const Standings = lazy(() => import('./pages/public/Standings'));
const InstitutionPage = lazy(() => import('./pages/public/InstitutionPage'));
const MesaApp = lazy(() => import('./pages/mesa/MesaApp'));
const AdminApp = lazy(() => import('./pages/admin/AdminApp'));

const Fallback = () => (
  <div className="flex min-h-[60dvh] items-center justify-center">
    <Spinner />
  </div>
);

export function App() {
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="jogo/:id" element={<MatchPage />} />
          <Route path="classificacao" element={<Standings />} />
          <Route path="atletica/:slug" element={<InstitutionPage />} />
        </Route>
        <Route
          path="mesa/*"
          element={
            <RequireAuth roles={['ADMIN', 'MESARIO']} title="Mesa" subtitle="área do mesário">
              <MesaApp />
            </RequireAuth>
          }
        />
        <Route
          path={`${ADMIN_PATH.slice(1)}/*`}
          element={
            <RequireAuth roles={['ADMIN']} title="Bastidores" subtitle="painel da organização">
              <AdminApp />
            </RequireAuth>
          }
        />
        <Route
          path="*"
          element={
            <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3">
              <p className="font-display text-6xl font-extrabold">404</p>
              <p className="text-mute">Esse lance não existe.</p>
              <Link to="/" className="mt-2 text-brand underline-offset-4 hover:underline">
                Voltar pros placares
              </Link>
            </div>
          }
        />
      </Routes>
    </Suspense>
  );
}
