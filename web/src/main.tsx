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
import { installErrorLogging } from './lib/log';

installErrorLogging();

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

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
