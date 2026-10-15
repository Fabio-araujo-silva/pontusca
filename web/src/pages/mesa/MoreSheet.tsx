import { ChevronLeft, ExternalLink, Flag, ListOrdered, RefreshCw, StickyNote, Timer, Users } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { clockElapsed, EngineOutput, mmss } from '@shared/engine';
import type { InstitutionDTO, Side, SportConfig } from '@shared/types';
import { Button, cx, HoldButton, Sheet } from '@/components/ui/primitives';
import { serverNow } from '@/lib/socket';
import { teamColors } from './helpers';
import type { Cmd } from './types';

type View = 'menu' | 'note' | 'wo' | 'clock';

export function MoreSheet({
  open,
  onClose,
  out,
  cfg,
  home,
  away,
  matchId,
  canOperate,
  send,
  onReload,
  onLineup,
  onParticipants,
}: {
  open: boolean;
  onClose: () => void;
  out: EngineOutput;
  cfg: SportConfig;
  home: InstitutionDTO | null;
  away: InstitutionDTO | null;
  matchId: string;
  canOperate: boolean;
  send: (c: Cmd) => boolean;
  onReload: () => void;
  onLineup: () => void;
  onParticipants?: () => void;
}) {
  const [view, setView] = useState<View>('menu');
  const [text, setText] = useState('');
  const [wo, setWo] = useState<Side | null>(null);
  const [mm, setMm] = useState('');
  const [ss, setSs] = useState('');
  const clock = out.live.clock;
  const ended = out.status === 'FINISHED';

  useEffect(() => {
    if (!open) {
      setView('menu');
      setText('');
      setWo(null);
    }
  }, [open]);
  useEffect(() => {
    if (view === 'clock' && clock) {
      const el = clockElapsed(clock, serverNow());
      const shown = clock.direction === 'down' && clock.durationMs ? clock.durationMs - el : el;
      const [m, s] = mmss(shown).split(':');
      setMm(m);
      setSs(s);
    }
  }, [view, clock]);

  const done = (ok: boolean) => ok && onClose();
  const Item = ({ icon, label, hint, onClick, disabled }: { icon: ReactNode; label: string; hint?: string; onClick: () => void; disabled?: boolean }) => (
    <button disabled={disabled} onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.04] px-4 py-3.5 text-left ring-1 ring-white/[0.05] active:bg-white/[0.08] disabled:opacity-35">
      <span className="text-white/80">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{label}</span>
        {hint && <span className="block text-[12px] text-mute">{hint}</span>}
      </span>
    </button>
  );

  const hc = teamColors(home);
  const ac = teamColors(away);
  const setClock = () => {
    const shown = (Number(mm) || 0) * 60_000 + (Number(ss) || 0) * 1000;
    const ms = clock?.direction === 'down' && clock.durationMs ? clock.durationMs - shown : shown;
    done(send({ type: 'CLOCK_SET', payload: { ms: Math.max(0, ms) } }));
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        view === 'menu' ? (
          'Mais opções'
        ) : (
          <button onClick={() => setView('menu')} className="inline-flex items-center gap-1">
            <ChevronLeft className="h-5 w-5" />
            {view === 'note' ? 'Observação' : view === 'wo' ? 'W.O.' : 'Ajustar relógio'}
          </button>
        )
      }
    >
      {view === 'menu' && (
        <div className="space-y-2">
          {cfg.engine !== 'RANKING' && <Item icon={<Users className="h-5 w-5" />} label="Escalação" hint="Titulares, números e atletas novos" onClick={() => (onClose(), onLineup())} />}
          {cfg.engine === 'RANKING' && onParticipants && <Item icon={<ListOrdered className="h-5 w-5" />} label="Participantes" hint="Raias e atletas da prova" onClick={() => (onClose(), onParticipants())} />}
          {clock && <Item icon={<Timer className="h-5 w-5" />} label="Ajustar relógio" hint="Corrigir o tempo mostrado" disabled={!canOperate} onClick={() => setView('clock')} />}
          <Item icon={<StickyNote className="h-5 w-5" />} label="Observação na timeline" hint="Ex.: jogo paralisado pela chuva" disabled={!canOperate} onClick={() => setView('note')} />
          {cfg.engine !== 'RANKING' && <Item icon={<Flag className="h-5 w-5" />} label="Declarar W.O." hint="Uma equipe não compareceu" disabled={!canOperate || ended} onClick={() => setView('wo')} />}
          <Item icon={<RefreshCw className="h-5 w-5" />} label="Recarregar do servidor" hint="Se algo parecer diferente do placar público" onClick={() => (onReload(), onClose())} />
          <Item icon={<ExternalLink className="h-5 w-5" />} label="Ver página pública" onClick={() => window.open(`/jogo/${matchId}`, '_blank')} />
        </div>
      )}
      {view === 'note' && (
        <div className="space-y-3">
          <textarea className="field min-h-[110px]" maxLength={280} autoFocus placeholder="O que aconteceu?" value={text} onChange={(e) => setText(e.target.value)} />
          <Button variant="primary" size="lg" className="w-full" disabled={!text.trim()} onClick={() => done(send({ type: 'NOTE', payload: { text } }))}>
            Publicar observação
          </Button>
        </div>
      )}
      {view === 'wo' && (
        <div className="space-y-4">
          <p className="text-[14px] text-white/75">Quem VENCEU por W.O.? O jogo é encerrado na hora.</p>
          <div className="flex gap-2">
            {(['home', 'away'] as const).map((s) => {
              const c = s === 'home' ? hc : ac;
              return (
                <button key={s} onClick={() => setWo(s)} className={cx('h-14 flex-1 rounded-2xl text-[15px] font-bold ring-2', wo === s ? 'ring-white' : 'ring-transparent opacity-70')} style={{ background: c.bg, color: c.fg }}>
                  {c.inst.name}
                </button>
              );
            })}
          </div>
          <HoldButton disabled={!wo} color="#ff3b30" textColor="#fff" onConfirm={() => wo && done(send({ type: 'WO', side: wo }))}>
            Confirmar W.O.
          </HoldButton>
        </div>
      )}
      {view === 'clock' && (
        <div className="space-y-4">
          <p className="text-[13px] text-mute">{clock?.direction === 'down' ? 'Tempo restante no período' : 'Tempo decorrido no período'}</p>
          <div className="flex items-center justify-center gap-2 font-display text-[44px] font-bold">
            <input className="field h-20 w-24 text-center font-display text-[44px]" inputMode="numeric" value={mm} onChange={(e) => setMm(e.target.value.replace(/\D/g, '').slice(0, 3))} />
            <span>:</span>
            <input className="field h-20 w-24 text-center font-display text-[44px]" inputMode="numeric" value={ss} onChange={(e) => setSs(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </div>
          <Button variant="primary" size="lg" className="w-full" onClick={setClock}>
            Ajustar relógio
          </Button>
        </div>
      )}
    </Sheet>
  );
}
