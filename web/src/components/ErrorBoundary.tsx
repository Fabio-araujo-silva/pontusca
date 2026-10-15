// Se um componente quebrar, mostra um aviso em vez da tela branca e registra o erro.
import { Component, ErrorInfo, ReactNode } from 'react';
import { report } from '@/lib/log';

interface State {
  error: Error | null;
}

// chunk antigo depois de um deploy: recarregar resolve (uma vez só, pra não entrar em loop)
const isStaleChunk = (e: Error) => /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(e.message);

export class ErrorBoundary extends Component<{ children: ReactNode; area?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isStaleChunk(error)) {
      try {
        if (!sessionStorage.getItem('arq.reloaded')) {
          sessionStorage.setItem('arq.reloaded', '1');
          location.reload();
          return;
        }
      } catch {
        /* ignore */
      }
    }
    report('error', 'react.crash', { err: error, data: { area: this.props.area, component: info.componentStack?.split('\n').slice(0, 8).join('\n') } });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-display text-[40px] font-extrabold uppercase leading-none">Opa, travou</p>
        <p className="max-w-sm text-[14px] text-mute">Algo deu errado nesta tela. O erro já foi registrado pra gente corrigir.</p>
        <div className="mt-2 flex gap-2">
          <button onClick={() => location.reload()} className="rounded-full bg-white px-4 py-2 text-[14px] font-semibold text-black">
            Recarregar
          </button>
          <button onClick={() => this.setState({ error: null })} className="rounded-full bg-white/[0.07] px-4 py-2 text-[14px] font-semibold">
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }
}
