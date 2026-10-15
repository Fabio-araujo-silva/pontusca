// Sandbox: gera torneio de teste e liga o "robô mesário" que joga partidas
// ao vivo pelo mesmo caminho dos mesários reais.
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, FlaskConical, Pause, Play, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Confirm, cx, LiveDot } from '@/components/ui/primitives';
import { get, post } from '@/lib/api';
import { useAdmin } from './ctx';
import { Field, NumInput, PageHeader, useAction } from './ui';

interface Status {
  running: boolean;
  speed: number;
  commands: number;
  errors: number;
  startedAt: number;
  lastError: string;
  tournaments: { id: string; name: string; matches: number }[];
  byStatus: Record<string, number>;
}

const STATUS_LABEL: Record<string, string> = { LIVE: 'Ao vivo', SCHEDULED: 'Agendados', FINISHED: 'Encerrados', POSTPONED: 'Adiados', CANCELED: 'Cancelados' };
const SPEEDS = [0.25, 0.5, 1, 2, 3, 5, 10];

export default function Sandbox() {
  const { refresh, setTournamentId } = useAdmin();
  const key = ['admin', 'sandbox'];
  const q = useQuery({ queryKey: key, queryFn: () => get<Status>('/admin/sandbox'), refetchInterval: 2000 });
  const [matches, setMatches] = useState<number | null>(18);
  const [live, setLive] = useState<number | null>(5);
  const [finished, setFinished] = useState<number | null>(5);
  const [speedIdx, setSpeedIdx] = useState(2);
  const [clear, setClear] = useState(false);
  const s = q.data;

  const generate = useAction(() => post<{ tournamentId: string; created: number }>('/admin/sandbox/generate', { matches: matches ?? 18, live: live ?? 0, finished: finished ?? 0 }), {
    ok: (r) => `${r.created} jogos de teste criados`,
    invalidate: [key],
    onDone: (r) => {
      refresh();
      setTournamentId(r.tournamentId);
    },
  });
  const start = useAction((speed: number) => post('/admin/sandbox/start', { speed }), { ok: 'Simulação rodando', invalidate: [key] });
  const stop = useAction(() => post('/admin/sandbox/stop'), { ok: 'Simulação pausada', invalidate: [key] });
  const wipe = useAction(() => post<{ tournaments: number; matches: number }>('/admin/sandbox/clear'), {
    ok: (r) => `Sandbox limpo (${r.matches} jogos apagados)`,
    invalidate: [key],
    onDone: () => (refresh(), setClear(false)),
  });

  const speed = SPEEDS[speedIdx];
  return (
    <div>
      <PageHeader
        title="Sandbox"
        subtitle="Ambiente de testes: gera atléticas/jogos falsos e um robô que registra lances ao vivo usando o mesmo caminho dos mesários (motor, banco, WebSocket, animações). Tudo fica isolado — o público só vê abrindo o site com ?sandbox=1."
        actions={
          <a href="/?sandbox=1" target="_blank" rel="noreferrer">
            <Button icon={<ExternalLink className="h-4 w-4" />}>Abrir site em modo sandbox</Button>
          </a>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-3">
            <span className={cx('flex h-11 w-11 items-center justify-center rounded-2xl', s?.running ? 'bg-live/15 text-live' : 'bg-white/[0.06] text-mute')}>
              {s?.running ? <LiveDot /> : <FlaskConical className="h-5 w-5" />}
            </span>
            <div>
              <div className="text-[16px] font-bold">{s?.running ? `Simulando a ${s.speed}x` : 'Simulação parada'}</div>
              <div className="text-[12px] text-mute">{s?.running && s.startedAt ? `desde ${new Date(s.startedAt).toLocaleTimeString('pt-BR')}` : 'Inicie pra o robô jogar as partidas ao vivo'}</div>
            </div>
            <div className="ml-auto">
              {s?.running ? (
                <Button variant="danger" icon={<Pause className="h-4 w-4" />} loading={stop.isPending} onClick={() => stop.mutate([])}>
                  Parar
                </Button>
              ) : (
                <Button variant="brand" icon={<Play className="h-4 w-4" />} loading={start.isPending} onClick={() => start.mutate([speed])}>
                  Iniciar a {speed}x
                </Button>
              )}
            </div>
          </div>
          <Field label={`Velocidade · ${speed}x (um passo a cada ${(2.5 / speed).toFixed(2).replace('.', ',')}s)`}>
            <input type="range" min={0} max={SPEEDS.length - 1} value={speedIdx} onChange={(e) => setSpeedIdx(Number(e.target.value))} className="w-full accent-[#d7ff3e]" />
            <div className="flex justify-between text-[11px] text-mute-2">
              {SPEEDS.map((x) => (
                <span key={x}>{x}x</span>
              ))}
            </div>
          </Field>
          {s?.running && speed !== s.speed && (
            <Button size="sm" className="mt-3" onClick={() => start.mutate([speed])}>
              Aplicar {speed}x agora
            </Button>
          )}

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Comandos', s?.commands ?? 0, ''],
              ['Erros', s?.errors ?? 0, s?.errors ? 'text-live' : ''],
              ...Object.entries(s?.byStatus ?? {}).map(([k, v]) => [STATUS_LABEL[k] ?? k, v, k === 'LIVE' ? 'text-live' : ''] as const),
            ].map(([l, v, c]) => (
              <div key={l as string} className="rounded-xl bg-white/[0.04] px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-mute">{l}</div>
                <div className={cx('font-display text-[26px] font-extrabold leading-none tabular', c as string)}>{v as number}</div>
              </div>
            ))}
          </div>
          {s?.lastError && <p className="mt-3 rounded-xl bg-live/10 px-3 py-2 text-[12px] text-live">Último erro: {s.lastError}</p>}
        </section>

        <section className="card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold">
            <Sparkles className="h-4 w-4 text-brand" /> Gerar torneio de teste
          </h3>
          <div className="grid gap-3">
            <Field label="Total de jogos">
              <NumInput value={matches} min={1} max={80} onChange={setMatches} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Ao vivo agora">
                <NumInput value={live} min={0} max={40} onChange={setLive} />
              </Field>
              <Field label="Já encerrados">
                <NumInput value={finished} min={0} max={40} onChange={setFinished} />
              </Field>
            </div>
            <p className="text-[12px] text-mute-2">Cobre todos os motores (futebol, vôlei, tênis, beisebol, provas…). Encerrados são jogados até o fim na hora; o resto fica agendado nos próximos dias.</p>
            <Button variant="brand" loading={generate.isPending} onClick={() => generate.mutate([])}>
              Gerar
            </Button>
          </div>
        </section>
      </div>

      <section className="card mt-4 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-bold">Torneios de teste · {s?.tournaments.length ?? 0}</h3>
          <Button variant="ghost" className="text-live" icon={<Trash2 className="h-4 w-4" />} disabled={!s?.tournaments.length} onClick={() => setClear(true)}>
            Limpar tudo
          </Button>
        </div>
        {!s?.tournaments.length ? (
          <p className="text-[13px] text-mute">Nenhum. Gere um acima.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {s.tournaments.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2 text-[14px]">
                <span className="flex-1 font-medium">{t.name}</span>
                <span className="text-[12px] text-mute">{t.matches} jogos</span>
                <Button size="sm" onClick={() => setTournamentId(t.id)}>
                  Usar no painel
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Confirm open={clear} onClose={() => setClear(false)} title="Apagar todo o sandbox?" danger hold confirmLabel="Apagar sandbox" onConfirm={() => wipe.mutate([])}>
        Remove torneios, jogos, lances, atletas e atléticas de teste e para o simulador. Dados reais não são tocados.
      </Confirm>
    </div>
  );
}
