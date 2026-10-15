// Motor SCORE: futebol, futsal, basquete, handebol, rugby, lutas, xadrez...
// Placar por soma de ações (gol = +1, cesta = +2/+3, try = +5), com períodos,
// relógio, prorrogação e disputa de pênaltis configuráveis.
import type { ClockView, EngineEvent, Highlight, LifecycleAction, LivePhase, MatchCommand, PeriodConfig, Side, SportAction, TimelineItem } from '../types';
import {
  ActionStats,
  Clock,
  DraftEvent,
  EngineError,
  EngineInput,
  EngineOutput,
  actionIcon,
  formatClock,
  ix,
  lifecycleItem,
  name,
  ord,
  other,
  requireSide,
  round2,
  winnerByScore,
} from './common';

const NO_PERIODS: PeriodConfig = { count: 1, label: 'Jogo', short: 'J', durationMin: null, clock: 'none', display: 'minute', breakLabel: 'Intervalo' };

interface Ctx {
  P: PeriodConfig;
  regCount: number;
  otCount: number;
  periodName(p: number): string;
  periodShort(p: number): string;
  clockView(p: number, c: Clock): ClockView | null;
  minute(ev: EngineEvent): string | null;
}

function ctx(input: EngineInput): Ctx {
  const cfg = input.config;
  const P = cfg.periods ?? NO_PERIODS;
  const OT = cfg.overtime ?? null;
  const regCount = P.count;
  const otCount = OT?.count ?? 0;
  const isOT = (p: number) => p > regCount;
  const durMin = (p: number) => (isOT(p) ? (OT?.durationMin ?? null) : P.durationMin);
  const offsetMin = (p: number) =>
    isOT(p) ? regCount * (P.durationMin ?? 0) + (p - regCount - 1) * (OT?.durationMin ?? 0) : (p - 1) * (P.durationMin ?? 0);
  const periodName = (p: number) => {
    if (isOT(p)) return otCount > 1 ? `${ord(p - regCount)} ${OT!.label}` : OT!.label;
    return regCount === 1 ? P.label : `${ord(p)} ${P.label}`;
  };
  const periodShort = (p: number) => {
    if (isOT(p)) return otCount > 1 ? `${OT!.short}${p - regCount}` : OT!.short;
    if (regCount === 1) return '';
    return ['Q', 'P', 'R'].includes(P.short) ? `${P.short}${p}` : `${p}${P.short}`;
  };
  const clockView = (p: number, c: Clock): ClockView | null => {
    if (P.clock === 'none' && !durMin(p)) return null;
    const d = durMin(p);
    return {
      running: c.running,
      baseMs: c.baseMs,
      startedAt: c.startedAt,
      direction: d ? (P.clock === 'down' ? 'down' : 'up') : 'up',
      durationMs: d ? d * 60000 : null,
      display: P.display,
      offsetMin: offsetMin(p),
    };
  };
  const minute = (ev: EngineEvent) => {
    if (ev.period == null) return null;
    const short = periodShort(ev.period);
    if (ev.clockMs == null || (P.clock === 'none' && !durMin(ev.period))) return short || null;
    const cv = clockView(ev.period, Object.assign(new Clock(), { baseMs: ev.clockMs, running: false }));
    if (!cv) return short || null;
    const t = formatClock(cv, ev.at);
    return P.display === 'minute' ? t : `${short ? short + ' ' : ''}${t}`;
  };
  return { P, regCount, otCount, periodName, periodShort, clockView, minute };
}

export function reduceScore(input: EngineInput): EngineOutput {
  const cfg = input.config;
  const C = ctx(input);
  let phase = 'PRE' as LivePhase; // cast: closures mudam a fase e o TS não rastreia
  let period = 0;
  let wo: Side | null = null;
  let decisive: Side | null = null;
  let endWinner: Side | 'draw' | null = null;
  const clock = new Clock();
  const score: [number, number] = [0, 0];
  const periods: [number, number][] = [];
  const fouls = new Map<number, [number, number]>();
  const timeouts: [number, number] = [0, 0];
  let shootout: { home: number; away: number; kicks: { side: Side; scored: boolean }[] } | null = null;
  const stats = new ActionStats();
  const timeline: TimelineItem[] = [];
  let highlight: Highlight | null = null;

  for (const ev of input.events) {
    highlight = null;
    switch (ev.type) {
      case 'MATCH_START':
        phase = 'PERIOD';
        period = 1;
        periods.push([0, 0]);
        clock.start(ev.at);
        timeline.push(lifecycleItem(ev, 'Início de jogo'));
        highlight = { type: 'start', label: 'COMEÇOU!', big: false };
        break;
      case 'PERIOD_END': {
        clock.pause(ev.at);
        phase = 'BREAK';
        const lastReg = period === C.regCount;
        timeline.push(lifecycleItem(ev, `Fim · ${C.periodName(period)}`, { minute: C.minute(ev) }));
        highlight = { type: 'period', label: lastReg ? 'FIM DO TEMPO NORMAL' : C.P.breakLabel.toUpperCase() };
        break;
      }
      case 'PERIOD_START':
        period += 1;
        periods.push([0, 0]);
        phase = 'PERIOD';
        clock.start(ev.at);
        timeline.push(lifecycleItem(ev, `Início · ${C.periodName(period)}`));
        highlight = { type: 'period', label: 'BOLA ROLANDO' };
        break;
      case 'CLOCK_PAUSE':
        clock.pause(ev.at);
        break;
      case 'CLOCK_RESUME':
        clock.resume(ev.at);
        break;
      case 'CLOCK_SET':
        clock.set(Number(ev.payload.ms) || 0, ev.at);
        break;
      case 'SHOOTOUT_START':
        clock.pause(ev.at);
        phase = 'SHOOTOUT';
        shootout = { home: 0, away: 0, kicks: [] };
        timeline.push(lifecycleItem(ev, cfg.shootout?.label ?? 'Pênaltis'));
        highlight = { type: 'period', label: (cfg.shootout?.label ?? 'Pênaltis').toUpperCase(), big: true };
        break;
      case 'SHOOTOUT_KICK': {
        if (!shootout || !ev.side) break;
        const scored = !!ev.payload.scored;
        shootout.kicks.push({ side: ev.side, scored });
        if (scored) shootout[ev.side] += 1;
        timeline.push({
          id: ev.id,
          seq: ev.seq,
          type: ev.type,
          side: ev.side,
          icon: scored ? 'pen-goal' : 'pen-miss',
          title: scored ? 'Cobrança convertida' : 'Cobrança perdida',
          subtitle: name(input, ev.athleteId),
          minute: 'PEN',
          scoreAfter: [shootout.home, shootout.away],
          at: ev.at,
        });
        highlight = scored ? { type: 'score', side: ev.side, label: 'GOL!', big: true, athleteName: name(input, ev.athleteId) } : { type: 'miss', side: ev.side, label: 'PERDEU!' };
        break;
      }
      case 'MATCH_END':
        clock.pause(ev.at);
        phase = 'END';
        endWinner = ev.payload.winner ?? null;
        timeline.push(lifecycleItem(ev, 'Fim de jogo', { icon: 'flag', minute: C.minute(ev) }));
        highlight = { type: 'end', label: 'FIM DE JOGO', big: true };
        break;
      case 'WO':
        clock.pause(ev.at);
        phase = 'END';
        wo = ev.side ?? null;
        timeline.push(lifecycleItem(ev, 'Vitória por W.O.', { icon: 'flag' }));
        highlight = { type: 'end', side: wo, label: 'W.O.', big: true };
        break;
      case 'NOTE':
        timeline.push({ id: ev.id, seq: ev.seq, type: ev.type, side: ev.side ?? null, icon: 'note', title: String(ev.payload.text ?? ''), minute: C.minute(ev), at: ev.at });
        break;
      case 'ACTION': {
        const a = ev.payload as SportAction;
        const side = ev.side as Side;
        if (!side) break;
        const athlete = name(input, ev.athleteId);
        const base = { id: ev.id, seq: ev.seq, type: ev.type, side, minute: C.minute(ev), at: ev.at };
        if (a.kind === 'score') {
          const v = a.value ?? 1;
          const credit = a.against ? other(side) : side;
          const cur = periods[periods.length - 1] ?? (periods.push([0, 0]), periods[0]);
          if (a.both) {
            score[0] = round2(score[0] + v);
            score[1] = round2(score[1] + v);
            cur[0] = round2(cur[0] + v);
            cur[1] = round2(cur[1] + v);
          } else {
            score[ix(credit)] = round2(score[ix(credit)] + v);
            cur[ix(credit)] = round2(cur[ix(credit)] + v);
          }
          if (a.decisive) decisive = credit;
          stats.add(a.key, side);
          timeline.push({
            ...base,
            side: a.both ? null : credit,
            icon: actionIcon('score', undefined, a.against, v > 1 ? 'points' : 'goal'),
            title: a.short ?? a.label,
            subtitle: athlete ? (a.against ? `${athlete} (contra)` : athlete) : null,
            scoreAfter: [score[0], score[1]],
            important: true,
          });
          highlight = {
            type: 'score',
            side: a.both ? null : credit,
            label: a.celebrate ?? `+${v}`,
            athleteName: athlete,
            value: v,
            big: !!a.celebrate,
          };
        } else {
          stats.add(a.key, side);
          if (a.kind === 'foul') {
            const f = fouls.get(period) ?? [0, 0];
            f[ix(side)] += 1;
            fouls.set(period, f);
          }
          if (a.kind === 'timeout') timeouts[ix(side)] += 1;
          let subtitle = athlete;
          if (a.kind === 'sub') {
            const out = name(input, ev.athleteId);
            const inn = name(input, ev.athlete2Id);
            subtitle = [out && `Sai ${out}`, inn && `Entra ${inn}`].filter(Boolean).join(' · ') || null;
          }
          timeline.push({
            ...base,
            icon: actionIcon(a.kind, a.color),
            title: a.short ?? a.label,
            subtitle,
            minor: a.kind === 'stat' || a.kind === 'foul',
          });
          if (a.kind === 'card' && a.color === 'red') highlight = { type: 'card', side, label: 'VERMELHO', athleteName: athlete };
          else if (a.kind === 'card') highlight = { type: 'card', side, label: (a.short ?? a.label).toUpperCase(), athleteName: athlete };
        }
        break;
      }
      default:
        break;
    }
  }

  // ---- estado final ----
  let shootoutDecided = false;
  if (shootout) {
    const kicks = input.config.shootout?.kicks ?? 5;
    const taken = { home: shootout.kicks.filter((k) => k.side === 'home').length, away: shootout.kicks.filter((k) => k.side === 'away').length };
    const remH = Math.max(0, kicks - taken.home);
    const remA = Math.max(0, kicks - taken.away);
    if (shootout.home > shootout.away + remA || shootout.away > shootout.home + remH) shootoutDecided = true;
    if (taken.home >= kicks && taken.home === taken.away && shootout.home !== shootout.away) shootoutDecided = true;
  }

  const isOT = period > C.regCount;
  const next: LifecycleAction[] = [];
  const hasClock = C.clockView(Math.max(period, 1), clock) != null;
  if (phase === 'PRE') next.push('START_MATCH');
  else if (phase === 'PERIOD') {
    const lastReg = period === C.regCount;
    const lastOT = isOT && period === C.regCount + C.otCount;
    if (decisive) next.push('END_MATCH');
    else if (!isOT && !lastReg) next.push('END_PERIOD');
    else if (lastReg) {
      next.push('END_MATCH');
      if (C.otCount || cfg.shootout) next.push('END_PERIOD');
    } else if (!lastOT) next.push('END_PERIOD');
    else {
      next.push('END_MATCH');
      if (cfg.shootout) next.push('END_PERIOD');
    }
    if (hasClock) next.push(clock.running ? 'PAUSE_CLOCK' : 'RESUME_CLOCK');
  } else if (phase === 'BREAK') {
    if (period < C.regCount) next.push('START_PERIOD');
    else if (isOT && period < C.regCount + C.otCount) next.push('START_PERIOD');
    else {
      if (!isOT && C.otCount) next.push('START_OVERTIME');
      if (cfg.shootout) next.push('START_SHOOTOUT');
      next.push('END_MATCH');
    }
  } else if (phase === 'SHOOTOUT') next.push('END_MATCH');

  let winner: Side | 'draw' | null = null;
  if (phase === 'END') {
    if (wo) winner = wo;
    else if (decisive) winner = decisive;
    else if (endWinner) winner = endWinner;
    else if (score[0] === score[1] && shootout && shootout.home !== shootout.away) winner = shootout.home > shootout.away ? 'home' : 'away';
    else winner = winnerByScore(score[0], score[1]);
  }

  let periodLabel = 'Pré-jogo';
  let shortLabel = '';
  if (phase === 'PERIOD') {
    periodLabel = C.periodName(period);
    shortLabel = C.periodShort(period) || 'AO VIVO';
  } else if (phase === 'BREAK') {
    const regEnded = period >= C.regCount;
    periodLabel = regEnded ? (isOT ? `Fim · ${C.periodName(period)}` : 'Fim do tempo normal') : C.P.breakLabel;
    shortLabel = regEnded ? 'FIM TN' : 'INT';
  } else if (phase === 'SHOOTOUT') {
    periodLabel = cfg.shootout?.label ?? 'Pênaltis';
    shortLabel = 'PEN';
  } else if (phase === 'END') {
    periodLabel = 'Encerrado';
    shortLabel = 'FIM';
  }

  const curFouls = fouls.get(period) ?? [0, 0];
  return {
    status: phase === 'PRE' ? 'SCHEDULED' : phase === 'END' ? 'FINISHED' : 'LIVE',
    score: {
      home: score[0],
      away: score[1],
      periods,
      shootout,
      fouls: { home: curFouls[0], away: curFouls[1] },
      timeouts: { home: timeouts[0], away: timeouts[1] },
    },
    live: {
      phase,
      period,
      isOvertime: isOT,
      periodLabel,
      shortLabel,
      clock: phase === 'PERIOD' || phase === 'BREAK' ? C.clockView(Math.max(period, 1), clock) : null,
      nextActions: next,
      suggestEnd: !!decisive || shootoutDecided,
    },
    winner,
    wo,
    timeline,
    stats: stats.rows(cfg),
    highlight,
  };
}

export function buildScore(input: EngineInput, out: EngineOutput, cmd: MatchCommand): DraftEvent {
  const cfg = input.config;
  const { phase, nextActions } = out.live;
  const need = (a: LifecycleAction, msg: string) => {
    if (!nextActions.includes(a)) throw new EngineError(msg);
  };
  switch (cmd.type) {
    case 'END_PERIOD':
      need('END_PERIOD', 'Não há período em andamento para encerrar.');
      return { type: 'PERIOD_END', payload: {} };
    case 'START_PERIOD':
      need('START_PERIOD', 'Não dá pra iniciar outro período agora.');
      return { type: 'PERIOD_START', payload: {} };
    case 'START_OVERTIME':
      need('START_OVERTIME', 'Prorrogação indisponível agora.');
      return { type: 'PERIOD_START', payload: { overtime: true } };
    case 'START_SHOOTOUT':
      if (!cfg.shootout) throw new EngineError('Esta modalidade não tem disputa de pênaltis.');
      if (phase !== 'BREAK' && phase !== 'PERIOD') throw new EngineError('Pênaltis só depois do tempo de jogo.');
      return { type: 'SHOOTOUT_START', payload: {} };
    case 'PAUSE_CLOCK':
      need('PAUSE_CLOCK', 'O relógio já está parado.');
      return { type: 'CLOCK_PAUSE', payload: {} };
    case 'RESUME_CLOCK':
      need('RESUME_CLOCK', 'O relógio já está rodando.');
      return { type: 'CLOCK_RESUME', payload: {} };
    case 'CLOCK_SET':
      if (phase !== 'PERIOD' && phase !== 'BREAK') throw new EngineError('Sem período ativo.');
      return { type: 'CLOCK_SET', payload: { ms: Math.max(0, Number(cmd.payload?.ms) || 0) } };
    case 'SHOOTOUT_KICK':
      if (phase !== 'SHOOTOUT') throw new EngineError('A disputa de pênaltis não começou.');
      return { type: 'SHOOTOUT_KICK', side: requireSide(cmd), athleteId: cmd.athleteId ?? null, payload: { scored: !!cmd.payload?.scored } };
    case 'ACTION': {
      const side = requireSide(cmd);
      const key = cmd.payload?.action;
      const a = cfg.actions.find((x) => x.key === key);
      if (!a) throw new EngineError('Ação desconhecida para esta modalidade.');
      if (a.kind === 'score' && phase !== 'PERIOD') throw new EngineError('Pontos só valem com a bola rolando (período em andamento).');
      if (phase === 'PRE' || phase === 'END') throw new EngineError('O jogo não está em andamento.');
      if (a.athlete === 'required' && !cmd.athleteId) throw new EngineError('Escolha o atleta.');
      const { key: k, label, kind, value, against, both, color, short, celebrate, decisive } = a;
      return {
        type: 'ACTION',
        side,
        athleteId: cmd.athleteId ?? null,
        athlete2Id: kind === 'sub' ? (cmd.athlete2Id ?? null) : null,
        payload: { key: k, label, kind, value, against, both, color, short, celebrate, decisive },
      };
    }
    default:
      throw new EngineError('Comando não suportado nesta modalidade.');
  }
}
