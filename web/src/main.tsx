// tipografia inspirada no TUSCA 2026: Funnel Display no texto, condensada pesada nos títulos/placar
import '@fontsource-variable/funnel-display';
import '@fontsource-variable/big-shoulders-display';
import './index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { Toaster } from './components/ui/primitives';
import { AuthProvider } from './lib/auth';
import { get } from './lib/api';
import { ADMIN_PATH } from './lib/auth';
import type { Bootstrap } from './lib/data';
import { installErrorLogging } from './lib/log';
import { SANDBOX } from './lib/sandbox';

installErrorLogging();

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

// site público: começa a buscar catálogo e feed ANTES de montar o React
if (!location.pathname.startsWith('/mesa') && !location.pathname.startsWith(ADMIN_PATH)) {
  void qc.prefetchQuery({ queryKey: ['bootstrap', SANDBOX], queryFn: () => get<Bootstrap>(`/public/bootstrap?sandbox=${SANDBOX ? 1 : 0}`), staleTime: 60_000 }).then(() => {
    const tid = qc.getQueryData<Bootstrap>(['bootstrap', SANDBOX])?.tournaments[0]?.id;
    if (tid) void qc.prefetchQuery({ queryKey: ['feed', tid], queryFn: () => get(`/public/tournaments/${tid}/feed`), staleTime: 30_000 });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <AuthProvider>
        {/* "reduzir movimento" do sistema desliga as animações de deslocamento */}
        <MotionConfig reducedMotion="user">
          <BrowserRouter>
            <App />
            <Toaster />
          </BrowserRouter>
        </MotionConfig>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
