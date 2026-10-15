// Motor BASEBALL: beisebol e softbol. Contagem (bolas/strikes/outs), entradas
// alto/baixo, linescore R-H-E, bases e avanço simplificado em rebatidas.
import type { BaseballView, Highlight, LifecycleAction, LivePhase, MatchCommand, Side, SportAction, TimelineItem } from '../types';
import { ActionStats, DraftEvent, EngineError, EngineInput, EngineOutput, actionIcon, lifecycleItem, name, other, winnerByScore } from './common';

const HIT_LABEL: Record<string, string> = { '1B': 'Simples', '2B': 'Dupla', '3B': 'Tripla', HR: 'Home run' };

export function reduceBaseball(input: EngineInput): EngineOutput {
  const innings = input.config.baseball?.innings ?? 9;
  let phase = 'PRE' as LivePhase; // cast: closures mudam a fase e o TS não rastreia
  let inning = 1;
  let half: 'top' | 'bottom' = 'top';
  let outs = 0;
  let balls = 0;
  let strikes = 0;
  let bases: [boolean, boolean, boolean] = [false, false, false];
  const line = { away: [] as (number | null)[], home: [] as (number | null)[] };
  const hits = { home: 0, away: 0 };
  const errors = { home: 0, away: 0 };
  const k = { home: 0, away: 0 }; // strikeouts sofridos pelo time rebatedor
  const bb = { home: 0, away: 0 };
  let wo: Side | null = null;
  let endWinner: Side | 'draw' | null = null;
  let gameOver = false;
  const stats = new ActionStats();
  const timeline: TimelineItem[] = [];
  let highlight: Highlight | null = null;

  const batting = (): Side => (half === 'top' ? 'away' : 'home');
  const runs = (s: Side) => line[s].reduce<number>((acc, v) => acc + (v ?? 0), 0);
  const ensureCell = () => {
    const s = batting();
    while (line[s].length < inning) line[s].push(null);
    if (line[s][inning - 1] == null) line[s][inning - 1] = 0;
  };
  const resetCount = () => {
    balls = 0;
    strikes = 0;
  };
  const inningLabel = () => `${half === 'top' ? '▲' : '▼'} ${inning}ª`;

  const addRuns = (n: number, ev: any, why: string) => {
    if (n <= 0) return;
    ensureCell();
    const s = batting();
    line[s][inning - 1] = (line[s][inning - 1] ?? 0) + n;
    timeline.push({
      id: ev.id + (why === 'auto' ? ':r' : ''),
      seq: ev.seq,
      type: 'RUN',
      side: s,
      icon: 'run',
      title: n > 1 ? `${n} corridas` : 'Corrida',
      subtitle: name(input, ev.athleteId),
      minute: inningLabel(),
      scoreAfter: [runs('home'), runs('away')],
      at: ev.at,
      important: true,
    });
    // walk-off: mandante vira no fim da última entrada (ou extra)
    if (half === 'bottom' && inning >= innings && runs('home') > runs('away')) gameOver = true;
  };

  const endHalf = (ev: any) => {
    timeline.push({ ...lifecycleItem(ev, `Fim · ${inningLabel()} — ${runs('away')} x ${runs('home')}`), id: ev.id + ':end', important: false, icon: 'inning' });
    ensureCell();
    bases = [false, false, false];
    outs = 0;
    resetCount();
    if (half === 'top') {
      if (inning >= innings && runs('home') > runs('away')) {
        gameOver = true; // mandante já vence, não precisa rebater
        return;
      }
      half = 'bottom';
    } else {
      if (inning >= innings && runs('home') !== runs('away')) {
        gameOver = true;
        return;
      }
      half = 'top';
      inning += 1;
    }
    ensureCell();
    highlight = { type: 'period', label: half === 'top' ? `${inning}ª ENTRADA` : 'TROCA', big: false };
  };

  const addOut = (ev: any, title: string) => {
    outs += 1;
    resetCount();
    timeline.push({ id: ev.id, seq: ev.seq, type: 'OUT', side: batting(), icon: 'out', title, subtitle: name(input, ev.athleteId), minute: inningLabel(), at: ev.at });
    highlight = { type: 'out', label: outs >= 3 ? '3 ELIMINAÇÕES' : 'ELIMINADO' };
    if (outs >= 3) endHalf(ev);
  };

  const walk = (ev: any) => {
    bb[batting()] += 1;
    resetCount();
    let scored = 0;
    if (!bases[0]) bases[0] = true;
    else if (!bases[1]) bases[1] = true;
    else if (!bases[2]) bases[2] = true;
    else scored = 1;
    timeline.push({ id: ev.id, seq: ev.seq, type: 'PITCH', side: batting(), icon: 'walk', title: 'Base por bolas', minute: inningLabel(), at: ev.at });
    addRuns(scored, ev, 'auto');
  };

  for (const ev of input.events) {
    highlight = null;
    if (gameOver && !['MATCH_END', 'NOTE', 'WO'].includes(ev.type)) continue;
    switch (ev.type) {
      case 'MATCH_START':
        phase = 'PERIOD';
        ensureCell();
        timeline.push(lifecycleItem(ev, 'Play ball!'));
        highlight = { type: 'start', label: 'PLAY BALL!' };
        break;
      case 'PITCH': {
        if (phase !== 'PERIOD') break;
        const r = ev.payload.result;
        if (r === 'BALL') {
          balls += 1;
          if (balls >= 4) walk(ev);
        } else if (r === 'STRIKE') {
          strikes += 1;
          if (strikes >= 3) {
            k[batting()] += 1;
            addOut(ev, 'Strikeout');
          }
        } else if (r === 'FOUL') {
          if (strikes < 2) strikes += 1;
        }
        if (!timeline.length || timeline[timeline.length - 1].id !== ev.id) {
          timeline.push({ id: ev.id, seq: ev.seq, type: 'PITCH', side: batting(), icon: 'pitch', title: r === 'BALL' ? 'Bola' : r === 'STRIKE' ? 'Strike' : 'Foul', minute: inningLabel(), at: ev.at, minor: true });
        }
        break;
      }
      case 'OUT':
        if (phase !== 'PERIOD') break;
        addOut(ev, ev.payload.label || 'Eliminação');
        break;
      case 'HIT': {
        if (phase !== 'PERIOD') break;
        const kind: string = ev.payload.kind || '1B';
        const s = batting();
        hits[s] += 1;
        resetCount();
        const adv = kind === 'HR' ? 4 : kind === '3B' ? 3 : kind === '2B' ? 2 : 1;
        let scored = 0;
        const nb: [boolean, boolean, boolean] = [false, false, false];
        bases.forEach((on, i) => {
          if (!on) return;
          const to = i + adv;
          if (to >= 3) scored += 1;
          else nb[to] = true;
        });
        if (adv >= 4) scored += 1;
        else nb[adv - 1] = true;
        bases = nb;
        timeline.push({ id: ev.id, seq: ev.seq, type: 'HIT', side: s, icon: kind === 'HR' ? 'homerun' : 'hit', title: HIT_LABEL[kind] ?? 'Rebatida', subtitle: name(input, ev.athleteId), minute: inningLabel(), at: ev.at, important: kind === 'HR' });
        highlight = kind === 'HR' ? { type: 'score', side: s, label: 'HOME RUN!', big: true, value: scored, athleteName: name(input, ev.athleteId) } : { type: 'hit', side: s, label: (HIT_LABEL[kind] ?? 'Rebatida').toUpperCase() };
        if (scored) addRuns(scored, ev, 'auto');
        break;
      }
      case 'RUN':
        if (phase !== 'PERIOD') break;
        addRuns(Number(ev.payload.n) || 1, ev, 'manual');
        highlight = { type: 'score', side: batting(), label: 'CORRIDA!', big: true, value: 1, athleteName: name(input, ev.athleteId) };
        break;
      case 'ERROR': {
        if (phase !== 'PERIOD') break;
        const fielding = other(batting());
        errors[fielding] += 1;
        timeline.push({ id: ev.id, seq: ev.seq, type: 'ERROR', side: fielding, icon: 'error', title: 'Erro', subtitle: name(input, ev.athleteId), minute: inningLabel(), at: ev.at });
        break;
      }
      case 'BASES':
        if (phase !== 'PERIOD') break;
        bases = [!!ev.payload.bases?.[0], !!ev.payload.bases?.[1], !!ev.payload.bases?.[2]];
        break;
      case 'ACTION': {
        const a = ev.payload as SportAction;
        if (!ev.side) break;
        stats.add(a.key, ev.side);
        timeline.push({ id: ev.id, seq: ev.seq, type: ev.type, side: ev.side, icon: actionIcon(a.kind, a.color), title: a.short ?? a.label, subtitle: [name(input, ev.athleteId), name(input, ev.athlete2Id)].filter(Boolean).join(' → ') || null, minute: inningLabel(), at: ev.at });
        break;
      }
      case 'MATCH_END':
        phase = 'END';
        endWinner = ev.payload.winner ?? null;
        timeline.push(lifecycleItem(ev, 'Fim de jogo', { icon: 'flag' }));
        highlight = { type: 'end', label: 'FIM DE JOGO', big: true };
        break;
      case 'WO':
        phase = 'END';
        wo = ev.side ?? null;
        timeline.push(lifecycleItem(ev, 'Vitória por W.O.', { icon: 'flag' }));
        highlight = { type: 'end', side: wo, label: 'W.O.', big: true };
        break;
      case 'NOTE':
        timeline.push({ id: ev.id, seq: ev.seq, type: ev.type, icon: 'note', title: String(ev.payload.text ?? ''), at: ev.at });
        break;
      default:
        break;
    }
  }

  const h = runs('home');
  const a = runs('away');
  const next: LifecycleAction[] = [];
  if (phase === 'PRE') next.push('START_MATCH');
  else if (phase === 'PERIOD' && gameOver) next.push('END_MATCH');

  const bbView: BaseballView = { inning, half, outs, balls, strikes, bases, innings: line, hits, errors };
  return {
    status: phase === 'PRE' ? 'SCHEDULED' : phase === 'END' ? 'FINISHED' : 'LIVE',
    score: { home: h, away: a, periods: [], baseball: bbView },
    live: {
      phase,
      period: inning,
      isOvertime: inning > innings,
      periodLabel: phase === 'PERIOD' ? `${half === 'top' ? 'Alto' : 'Baixo'} da ${inning}ª` : phase === 'END' ? 'Encerrado' : 'Pré-jogo',
      shortLabel: phase === 'PERIOD' ? inningLabel().replace(' ', '') : phase === 'END' ? 'FIM' : '',
      clock: null,
      nextActions: next,
      suggestEnd: gameOver && phase !== 'END',
    },
    winner: phase === 'END' ? (wo ?? endWinner ?? winnerByScore(h, a)) : null,
    wo,
    timeline,
    stats: stats.rows(input.config, [
      { label: 'Rebatidas', home: hits.home, away: hits.away },
      { label: 'Erros', home: errors.home, away: errors.away },
      { label: 'Strikeouts sofridos', home: k.home, away: k.away },
      { label: 'Bases por bolas', home: bb.home, away: bb.away },
    ]),
    highlight,
  };
}

export function buildBaseball(input: EngineInput, out: EngineOutput, cmd: MatchCommand): DraftEvent {
  if (out.live.phase !== 'PERIOD') throw new EngineError('O jogo não está em andamento.');
  const p = cmd.payload ?? {};
  // grava o lado no evento (time rebatedor / defensor) pra dar pra atribuir o atleta depois
  const batting: Side = out.score.baseball?.half === 'bottom' ? 'home' : 'away';
  const fielding: Side = batting === 'home' ? 'away' : 'home';
  switch (cmd.type) {
    case 'PITCH':
      if (!['BALL', 'STRIKE', 'FOUL'].includes(p.result)) throw new EngineError('Arremesso inválido.');
      return { type: 'PITCH', payload: { result: p.result } };
    case 'OUT':
      return { type: 'OUT', side: batting, athleteId: cmd.athleteId ?? null, payload: { label: p.label ?? null } };
    case 'HIT':
      return { type: 'HIT', side: batting, athleteId: cmd.athleteId ?? null, payload: { kind: ['1B', '2B', '3B', 'HR'].includes(p.kind) ? p.kind : '1B' } };
    case 'RUN':
      return { type: 'RUN', side: batting, athleteId: cmd.athleteId ?? null, payload: { n: Math.max(1, Math.min(4, Number(p.n) || 1)) } };
    case 'ERROR':
      return { type: 'ERROR', side: fielding, athleteId: cmd.athleteId ?? null, payload: {} };
    case 'BASES':
      return { type: 'BASES', payload: { bases: [!!p.bases?.[0], !!p.bases?.[1], !!p.bases?.[2]] } };
    case 'ACTION': {
      const a = input.config.actions.find((x) => x.key === p.action);
      if (!a || !cmd.side) throw new EngineError('Ação inválida.');
      return { type: 'ACTION', side: cmd.side, athleteId: cmd.athleteId ?? null, athlete2Id: cmd.athlete2Id ?? null, payload: { key: a.key, label: a.label, kind: a.kind, short: a.short, athlete: a.athlete } };
    }
    default:
      throw new EngineError('Comando não suportado nesta modalidade.');
  }
}

