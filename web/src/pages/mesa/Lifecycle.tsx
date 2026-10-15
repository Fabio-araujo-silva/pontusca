import { Flag, Pause, Play, Whistle } from './icons';
import { useState } from 'react';
import type { EngineOutput } from '@shared/engine';
import type { InstitutionDTO, LifecycleAction, Side, SportConfig } from '@shared/types';
import { cx, HoldButton, Sheet } from '@/components/ui/primitives';
import { TeamFlag } from '@/components/ui/TeamFlag';
import { fmtScore } from '@/lib/format';
import { actionHint, actionLabel, CRITICAL, teamColors } from './helpers';
import type { Cmd } from './types';

const TYPE: Record<LifecycleAction, Cmd['type']> = {
  START_MATCH: 'START_MATCH',
  END_PERIOD: 'END_PERIOD',
  START_PERIOD: 'START_PERIOD',
  START_OVERTIME: 'START_OVERTIME',
  START_SHOOTOUT: 'START_SHOOTOUT',
  END_MATCH: 'END_MATCH',
  PAUSE_CLOCK: 'PAUSE_CLOCK',
  RESUME_CLOCK: 'RESUME_CLOCK',
};

export function LifecycleBar({
  out,
  cfg,
  home,
  away,
  send,
  disabled,
}: {
  out: EngineOutput;
  cfg: SportConfig;
  home: InstitutionDTO | null;
  away: InstitutionDTO | null;
  send: (c: Cmd) => boolean;
  disabled?: boolean;
}) {
  const [confirm, setConfirm] = useState<LifecycleAction | null>(null);
  const L = out.live;
  let critical = L.nextActions.filter((a) => CRITICAL.includes(a));
  if (L.suggestEnd && critical.includes('END_MATCH')) critical = ['END_MATCH', ...critical.filter((a) => a !== 'END_MATCH')];
  const clockAct = L.nextActions.find((a) => a === 'PAUSE_CLOCK' || a === 'RESUME_CLOCK');
  if (!critical.length && !clockAct) return null;
  const [primary, ...others] = critical;

  return (
    <>
      <div className="flex items-stretch gap-2">
        {primary && (
          <button
            disabled={disabled}
            onClick={() => setConfirm(primary)}
            className={cx(
              'flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-2xl px-4 text-[15px] font-bold transition active:scale-[0.98] disabled:opacity-40',
              L.suggestEnd && primary === 'END_MATCH' ? 'animate-pulse bg-live text-white' : primary === 'END_MATCH' ? 'bg-white/[0.09] text-white ring-1 ring-white/15' : 'bg-brand text-brand-ink',
            )}
            style={{ touchAction: 'manipulation' }}
          >
            {primary === 'END_MATCH' ? <Flag className="h-5 w-5" /> : <Whistle className="h-5 w-5" />}
            {L.suggestEnd && primary === 'END_MATCH' ? 'Jogo decidido — encerrar?' : actionLabel(primary, out, cfg)}
          </button>
        )}
        {clockAct && (
          <button
            disabled={disabled}
            onClick={() => send({ type: TYPE[clockAct] })}
            aria-label={actionLabel(clockAct, out, cfg)}
            className={cx(
              'flex min-h-[56px] min-w-[56px] items-center justify-center gap-2 rounded-2xl px-4 font-bold transition active:scale-95 disabled:opacity-40',
              clockAct === 'PAUSE_CLOCK' ? 'bg-white/[0.09] text-white ring-1 ring-white/15' : 'bg-win text-black',
              !primary && 'flex-1',
            )}
            style={{ touchAction: 'manipulation' }}
          >
            {clockAct === 'PAUSE_CLOCK' ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
            <span className="text-[13px]">{clockAct === 'PAUSE_CLOCK' ? 'Parar' : 'Rodar'}</span>
          </button>
        )}
      </div>
      {others.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {others.map((a) => (
            <button key={a} disabled={disabled} onClick={() => setConfirm(a)} className="h-11 flex-1 whitespace-nowrap rounded-xl bg-white/[0.06] px-3 text-[13px] font-semibold ring-1 ring-white/10 active:scale-[0.98] disabled:opacity-40">
              {actionLabel(a, out, cfg)}
            </button>
          ))}
        </div>
      )}
      <ConfirmLifecycle action={confirm} onClose={() => setConfirm(null)} out={out} cfg={cfg} home={home} away={away} send={send} />
    </>
  );
}

function ConfirmLifecycle({
  action,
  onClose,
  out,
  cfg,
  home,
  away,
  send,
}: {
  action: LifecycleAction | null;
  onClose: () => void;
  out: EngineOutput;
  cfg: SportConfig;
  home: InstitutionDTO | null;
  away: InstitutionDTO | null;
  send: (c: Cmd) => boolean;
}) {
  const [server, setServer] = useState<Side>('home');
  const [winner, setWinner] = useState<Side | 'draw' | null>(null);
  const S = out.score;
  const tie = S.home === S.away;
  const shootoutDecides = !!S.shootout && S.shootout.home !== S.shootout.away;
  const askWinner = action === 'END_MATCH' && cfg.engine !== 'RANKING' && tie && !shootoutDecides && !out.live.suggestEnd;
  const mustPick = askWinner && !cfg.allowDraw;
  const hc = teamColors(home);
  const ac = teamColors(away);

  const confirm = () => {
    if (!action) return;
    const payload: Record<string, unknown> = {};
    if (action === 'START_MATCH' && cfg.engine === 'TENNIS') payload.server = server;
    if (askWinner && winner) payload.winner = winner;
    if (send({ type: TYPE[action], payload })) {
      setWinner(null);
      onClose();
    }
  };

  const pickBtn = (v: Side | 'draw', label: string, color?: string, fg?: string) => {
    const on = (action === 'START_MATCH' ? server : winner) === v;
    return (
      <button
        key={v}
        onClick={() => (action === 'START_MATCH' ? setServer(v as Side) : setWinner(v))}
        className={cx('flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl px-2 text-[14px] font-bold ring-2 transition active:scale-95', on ? 'ring-white' : 'ring-transparent opacity-70')}
        style={{ background: color ?? 'rgb(var(--fg) / .08)', color: fg ?? 'rgb(var(--fg))' }}
      >
        {label}
      </button>
    );
  };

  return (
    <Sheet
      open={!!action}
      onClose={onClose}
      title={action ? actionLabel(action, out, cfg) : ''}
      footer={
        <HoldButton onConfirm={confirm} disabled={mustPick && !winner} color={action === 'END_MATCH' ? '#e0261d' : '#111114'} textColor="#ffffff">
          {action ? actionLabel(action, out, cfg) : ''}
        </HoldButton>
      }
    >
      {action && (
        <div className="space-y-4">
          <p className="text-[14px] leading-relaxed text-white/80">{actionHint(action, out, cfg)}</p>
          {cfg.engine !== 'RANKING' && (
            <div className="flex items-center justify-center gap-4 rounded-2xl bg-white/[0.04] py-4">
              <TeamFlag inst={hc.inst} size={36} />
              <span className="font-display text-[44px] font-extrabold leading-none tabular">
                {fmtScore(S.home)} <span className="text-white/30">–</span> {fmtScore(S.away)}
              </span>
              <TeamFlag inst={ac.inst} size={36} />
            </div>
          )}
          {action === 'START_MATCH' && cfg.engine === 'TENNIS' && (
            <div>
              <p className="label">Quem saca primeiro?</p>
              <div className="flex gap-2">
                {pickBtn('home', hc.inst.name, hc.bg, hc.fg)}
                {pickBtn('away', ac.inst.name, ac.bg, ac.fg)}
              </div>
            </div>
          )}
          {askWinner && (
            <div>
              <p className="label">{mustPick ? 'Empatado — quem venceu?' : 'Resultado (decisão / desempate)'}</p>
              <div className="flex gap-2">
                {pickBtn('home', hc.inst.name, hc.bg, hc.fg)}
                {cfg.allowDraw && pickBtn('draw', 'Empate')}
                {pickBtn('away', ac.inst.name, ac.bg, ac.fg)}
              </div>
              {!mustPick && <p className="mt-2 text-[12px] text-mute">Sem escolha, vale o placar (empate).</p>}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
