import { ChevronLeft, CircleCheck, CloudOff, Ellipsis, Lock, Loader2, ShieldAlert, UserRoundPen, Users } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { InstitutionDTO, Side } from '@shared/types';
import { Button, cx, Empty, IconButton, Sheet, Spinner } from '@/components/ui/primitives';
import { SportIcon } from '@/components/ui/SportIcon';
import { useBootstrap } from '@/lib/data';
import { GENDER } from '@/lib/format';
import { useWakeLock } from '@/lib/hooks';
import { missingAuthor } from '@shared/engine';
import { TimelineIcon } from '@/components/match/TimelineIcon';
import { AthletePicker, PickerRequest } from './AthletePicker';
import { AuthorBar, eventIcon, eventTitle } from './AuthorBar';
import { BaseballPanel } from './BaseballPanel';
import type { PanelCtx, PickOpts } from './ctx';
import { teamColors } from './helpers';
import { LifecycleBar } from './Lifecycle';
import { LineupSheet } from './LineupSheet';
import { MoreSheet } from './MoreSheet';
import { ParticipantsEditor, RankingPanel } from './RankingPanel';
import { SetsPanel, TennisPanel } from './RallyPanels';
import { Scoreboard } from './Scoreboard';
import { ScorePanel } from './ScorePanel';
import { MesaTimeline } from './Timeline';
import { useConsole } from './useConsole';

function SyncBadge({ connected, pending, issue }: { connected: boolean; pending: number; issue: boolean }) {
  if (!connected || issue)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-live/15 px-2.5 py-1 text-[11px] font-bold text-live">
        <CloudOff className="h-3.5 w-3.5" />
        {pending ? `${pending} lance${pending > 1 ? 's' : ''} aguardando sinal` : 'Sem sinal'}
      </span>
    );
  if (pending)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warn/15 px-2.5 py-1 text-[11px] font-bold text-warn">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando {pending}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-win/15 px-2.5 py-1 text-[11px] font-bold text-win">
      <CircleCheck className="h-3.5 w-3.5" /> Sincronizado
    </span>
  );
}

export default function Console() {
  const { id = '' } = useParams();
  const c = useConsole(id);
  const boot = useBootstrap();
  useWakeLock(true);
  const [picker, setPicker] = useState<PickerRequest | null>(null);
  const resolver = useRef<((v: string | null | undefined) => void) | null>(null);
  const [lineupOpen, setLineupOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState(false);
  const [unOpen, setUnOpen] = useState(false);

  const data = c.data;
  const out = c.out;
  const addAthlete = c.addAthlete;

  const pickAthlete = useCallback(
    (side: Side, opts: PickOpts) =>
      new Promise<string | null | undefined>((resolve) => {
        if (!data) return resolve(undefined);
        const tc = teamColors(side === 'home' ? data.meta.home : data.meta.away);
        resolver.current = resolve;
        setPicker({
          ...opts,
          players: data.detail.lineups[side],
          color: tc.bg,
          fg: tc.fg,
          onPick: (v) => {
            resolver.current = null;
            resolve(v);
          },
          onAdd: (name, number) => addAthlete(side, name, number, false),
        });
      }),
    [data, addAthlete],
  );
  const closePicker = useCallback(() => {
    resolver.current?.(undefined);
    resolver.current = null;
    setPicker(null);
  }, []);

  const institutions = useMemo<InstitutionDTO[]>(() => {
    const list = [...(boot.data?.institutions ?? [])];
    for (const i of [data?.meta.home, data?.meta.away]) if (i && !list.some((x) => x.id === i.id)) list.push(i);
    return list;
  }, [boot.data, data]);

  if (c.error && !data)
    return (
      <div className="mx-auto max-w-md pt-20">
        <Empty icon={<ShieldAlert className="h-6 w-6" />} title="Não deu pra abrir o jogo">
          {c.error}
          <div className="mt-4">
            <Link to="/mesa" className="text-brand">
              Voltar pros meus jogos
            </Link>
          </div>
        </Empty>
      </div>
    );
  if (!data || !out)
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Spinner />
      </div>
    );

  const { detail, engine, meta } = data;
  const cfg = engine.config;
  const manual = !!engine.manual;
  const ended = out.status === 'FINISHED';
  const frozen = detail.status === 'POSTPONED' || detail.status === 'CANCELED';
  const readOnly = !meta.canOperate;
  const disabled = readOnly || manual || ended || frozen;
  const askEv = c.ask ? c.findEvent(c.ask.eventId) : null;
  const asking = askEv && missingAuthor(askEv, cfg) && !disabled ? askEv : null;
  const pickMore = async (step: 1 | 2) => {
    if (!asking?.side || !c.ask) return;
    const eid = c.ask.eventId;
    const r = await pickAthlete(asking.side, { title: `${eventTitle(asking)} — ${step === 2 ? 'quem entrou?' : 'quem fez?'}`, optional: false });
    if (r) c.assign(eid, step === 2 ? { athlete2Id: r } : { athleteId: r });
  };
  const ctx: PanelCtx = { out, cfg, events: c.events, detail, home: meta.home, away: meta.away, disabled, sportIcon: meta.sport.icon, send: c.send, pickAthlete };

  const panel = (() => {
    switch (cfg.engine) {
      case 'SETS':
        return <SetsPanel ctx={ctx} />;
      case 'TENNIS':
        return <TennisPanel ctx={ctx} />;
      case 'BASEBALL':
        return <BaseballPanel ctx={ctx} />;
      case 'RANKING':
        return <RankingPanel ctx={ctx} participants={engine.participants} institutions={institutions} onSaveParticipants={c.saveParticipants} />;
      default:
        return <ScorePanel ctx={ctx} />;
    }
  })();

  return (
    <div className={cx('mx-auto min-h-[100dvh] max-w-3xl', asking ? 'pb-52' : 'pb-24')} style={{ touchAction: 'manipulation' }}>
      <header className="sticky top-0 z-30 bg-ink/90 px-3 pb-2 pt-[max(env(safe-area-inset-top),8px)] backdrop-blur-xl">
        <div className="mb-2 flex items-center gap-1">
          <Link to="/mesa" aria-label="Voltar" className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full active:bg-white/10">
            <ChevronLeft className="h-6 w-6" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 truncate text-[14px] font-bold">
              <SportIcon name={meta.sport.icon} size={16} className="shrink-0 text-white/70" />
              <span className="truncate">
                {meta.sport.name} · {GENDER[detail.gender]}
              </span>
            </div>
            <div className="truncate text-[11px] text-mute">{[detail.phase, detail.group && `Grupo ${detail.group}`, detail.venue, meta.tournament?.name].filter(Boolean).join(' · ')}</div>
          </div>
          <SyncBadge connected={c.connected} pending={c.pending} issue={c.syncIssue || !!c.blocked} />
          {cfg.engine !== 'RANKING' && (
            <IconButton label="Escalação" onClick={() => setLineupOpen(true)}>
              <Users className="h-5 w-5" />
            </IconButton>
          )}
          <IconButton label="Mais opções" onClick={() => setMoreOpen(true)}>
            <Ellipsis className="h-5 w-5" />
          </IconButton>
        </div>
        <Scoreboard out={out} cfg={cfg} home={meta.home} away={meta.away} title={detail.title} />
      </header>

      <div className="space-y-4 px-3 pt-3">
        {readOnly && (
          <div className="flex items-start gap-3 rounded-2xl bg-warn/10 p-3 ring-1 ring-warn/30">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
            <div className="text-[13px]">
              <p className="font-bold text-warn">{meta.role === 'backup' ? 'Você é o reserva — aguardando o admin liberar' : 'Modo leitura'}</p>
              <p className="text-white/70">Assim que liberar, os botões aparecem aqui sozinhos.{meta.mesario && ` Titular: ${meta.mesario.name}.`}</p>
            </div>
          </div>
        )}
        {meta.role === 'backup' && meta.canOperate && <div className="rounded-2xl bg-brand/10 px-3 py-2 text-[13px] font-semibold text-brand ring-1 ring-brand/30">Liberado pelo admin: você está registrando como reserva.</div>}
        {c.blocked && c.pending > 0 && (
          <div className="rounded-2xl bg-live/10 p-3 ring-1 ring-live/30">
            <p className="text-[14px] font-bold text-live">
              {c.pending} lance{c.pending > 1 ? 's' : ''} guardado{c.pending > 1 ? 's' : ''} no aparelho
            </p>
            <p className="mt-0.5 text-[13px] text-white/75">
              {c.blocked === 'auth' ? 'Sua sessão expirou. Entre de novo e eles são enviados sozinhos.' : 'Você não tem permissão pra registrar neste jogo agora. Quando o admin liberar, eles são enviados sozinhos.'}
            </p>
            <button onClick={c.discardQueue} className="mt-2 text-[12px] font-semibold text-mute underline underline-offset-2">
              Descartar esses lances
            </button>
          </div>
        )}
        {frozen && <div className="rounded-2xl bg-warn/10 px-3 py-3 text-[13px] font-semibold text-warn ring-1 ring-warn/30">Jogo {detail.status === 'POSTPONED' ? 'adiado' : 'cancelado'} pelo admin. O console fica bloqueado.</div>}
        {manual && <div className="rounded-2xl bg-white/[0.05] px-3 py-3 text-[13px] text-white/80">Resultado lançado manualmente pelo admin. O console fica bloqueado.</div>}
        {ended && !manual && (
          <div className="rounded-2xl bg-white/[0.05] px-4 py-3 text-[13px] text-white/80">
            <p className="font-display text-[22px] font-bold text-white uppercase">Jogo encerrado</p>
            Encerrou sem querer? Use “Desfazer último” nos lances para reabrir.
          </div>
        )}

        {!disabled && <LifecycleBar out={out} cfg={cfg} home={meta.home} away={meta.away} send={c.send} />}

        {!ended && !manual && !frozen && (
          <section className={cx('relative', out.live.phase === 'PRE' && cfg.engine !== 'RANKING' && 'opacity-60')}>
            {out.live.phase === 'PRE' && cfg.engine !== 'RANKING' && !readOnly && <p className="mb-2 text-center text-[12px] font-semibold uppercase tracking-wider text-mute">Inicie o jogo para registrar lances</p>}
            {panel}
          </section>
        )}

        {c.unassigned.length > 0 && meta.canOperate && !manual && (
          <button onClick={() => setUnOpen(true)} className="flex w-full items-center gap-3 rounded-2xl bg-warn/10 px-4 py-3 text-left ring-1 ring-warn/25 active:scale-[0.99]">
            <UserRoundPen className="h-5 w-5 shrink-0 text-warn" />
            <span className="flex-1 text-[14px] font-semibold">
              {c.unassigned.length} lance{c.unassigned.length > 1 ? 's' : ''} sem autor
              <span className="block text-[12px] font-medium text-mute">Toque pra dizer quem fez — dá pra deixar pro intervalo.</span>
            </span>
          </button>
        )}

        <section className="pt-2">
          <MesaTimeline items={out.timeline} pendingIds={c.pendingIds} home={meta.home} away={meta.away} sportIcon={meta.sport.icon} canEdit={meta.canOperate && !manual} onVoid={c.voidEvent} />
        </section>
      </div>

      <AthletePicker req={picker} onClose={closePicker} />
      <AuthorBar
        ev={asking}
        cfg={cfg}
        lineups={detail.lineups}
        events={c.events}
        home={meta.home}
        away={meta.away}
        sportIcon={meta.sport.icon}
        onAssign={(who) => c.ask && c.assign(c.ask.eventId, who)}
        onMore={(step) => void pickMore(step)}
        onClose={() => c.setAsk(null)}
      />
      <Sheet open={unOpen} onClose={() => setUnOpen(false)} title="Lances sem autor">
        <div className="divide-y divide-white/[0.06]">
          {c.unassigned
            .slice()
            .reverse()
            .map((e) => {
              const team = e.side === 'away' ? meta.away : meta.home;
              const minute = out.timeline.find((t) => t.id === e.id)?.minute;
              return (
                <button
                  key={e.id}
                  onClick={() => {
                    c.setAsk({ eventId: e.id });
                    setUnOpen(false);
                  }}
                  className="flex w-full items-center gap-3 py-3 text-left active:bg-white/[0.03]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06]">
                    <TimelineIcon icon={eventIcon(e)} sportIcon={meta.sport.icon} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{eventTitle(e)}</span>
                    <span className="block truncate text-[12px] text-mute">{[team?.name, minute].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="text-[13px] font-semibold">Atribuir</span>
                </button>
              );
            })}
        </div>
      </Sheet>
      <LineupSheet
        open={lineupOpen}
        onClose={() => setLineupOpen(false)}
        lineups={detail.lineups}
        roster={meta.roster}
        home={meta.home}
        away={meta.away}
        cfg={cfg}
        readOnly={readOnly}
        onSave={c.saveLineup}
        onAdd={c.addAthlete}
      />
      <MoreSheet
        sandbox={detail.isSandbox}
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        out={out}
        cfg={cfg}
        home={meta.home}
        away={meta.away}
        matchId={id}
        canOperate={meta.canOperate && !manual}
        send={c.send}
        onReload={() => void c.reload()}
        onLineup={() => setLineupOpen(true)}
        onParticipants={() => setPartsOpen(true)}
      />
      <Sheet open={partsOpen} onClose={() => setPartsOpen(false)} title="Participantes">
        {readOnly ? (
          <p className="text-[13px] text-mute">Somente leitura.</p>
        ) : (
          <ParticipantsEditor
            participants={engine.participants}
            institutions={institutions}
            onSave={async (p) => {
              await c.saveParticipants(p);
              setPartsOpen(false);
            }}
          />
        )}
        <Button variant="ghost" className="mt-3 w-full" onClick={() => setPartsOpen(false)}>
          Fechar
        </Button>
      </Sheet>
    </div>
  );
}
