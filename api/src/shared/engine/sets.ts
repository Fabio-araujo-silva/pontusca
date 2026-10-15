// Motor SETS: vôlei, vôlei de praia, tênis de mesa, badminton, futevôlei,
// e-sports (mapas). Ponto a ponto, set fecha sozinho ao bater o alvo com a
// vantagem mínima; sets "manuais" (alvo nulo) fecham com SET_WIN.
import type { Highlight, LifecycleAction, LivePhase, MatchCommand, Side, SportAction, TimelineItem } from '../types';
import { ActionStats, DraftEvent, EngineError, EngineInput, EngineOutput, actionIcon, ix, lifecycleItem, name, ord, requireSide, winnerByScore } from './common';

export function reduceSets(input: EngineInput): EngineOutput {
  const cfg = input.config;
  const S = cfg.sets ?? { bestOf: 3, target: 25, decidingTarget: 15, winBy: 2, cap: null, label: 'Set' };
  const needed = Math.ceil(S.bestOf / 2);
  let phase = 'PRE' as LivePhase; // cast: closures mudam a fase e o TS não rastreia
  let set = 0;
  const sets: [number, number][] = [];
  const won: [number, number] = [0, 0];
  const timeouts: [number, number] = [0, 0];
  let wo: Side | null = null;
  let endWinner: Side | 'draw' | null = null;
  const stats = new ActionStats();
  const pointsTotal: [number, number] = [0, 0];
  const timeline: TimelineItem[] = [];
  let highlight: Highlight | null = null;

  const targetFor = (setNo: number) => (setNo === S.bestOf ? (S.decidingTarget ?? S.target) : S.target);
  const matchOver = () => won[0] >= needed || won[1] >= needed;
  const setName = (n: number) => `${ord(n)} ${S.label.toLowerCase()}`;

  const closeSet = (side: Side, ev: { id: string; seq: number; at: number; type: any }) => {
    won[ix(side)] += 1;
    phase = 'BREAK';
    const cur = sets[set - 1];
    timeline.push({
      ...lifecycleItem(ev as any, `${S.label} ${set} — ${cur[0]} x ${cur[1]}`),
      icon: 'set',
      side,
      scoreAfter: [won[0], won[1]],
    });
    highlight = { type: 'set', side, label: `${S.label.toUpperCase()}!`, big: true };
  };

  const openSet = () => {
    set += 1;
    sets.push([0, 0]);
    phase = 'PERIOD';
  };

  for (const ev of input.events) {
    highlight = null;
    switch (ev.type) {
      case 'MATCH_START':
        openSet();
        timeline.push(lifecycleItem(ev, 'Início de jogo'));
        highlight = { type: 'start', label: 'COMEÇOU!' };
        break;
      case 'PERIOD_START':
        openSet();
        timeline.push(lifecycleItem(ev, `Início · ${setName(set)}`));
        break;
      case 'POINT': {
        if (!ev.side) break;
        if (phase === 'BREAK' && !matchOver()) openSet(); // ponto depois do set fechado já abre o próximo
        if (phase !== 'PERIOD') break;
        const cur = sets[set - 1];
        const i = ix(ev.side);
        cur[i] += 1;
        pointsTotal[i] += 1;
        timeline.push({
          id: ev.id,
          seq: ev.seq,
          type: ev.type,
          side: ev.side,
          icon: 'point',
          title: 'Ponto',
          subtitle: name(input, ev.athleteId),
          minute: `${S.label[0]}${set}`,
          scoreAfter: [cur[0], cur[1]],
          at: ev.at,
          minor: true,
        });
        highlight = { type: 'score', side: ev.side, label: '+1', value: 1 };
        const tgt = targetFor(set);
        if (tgt != null) {
          const me = cur[i];
          const op = cur[1 - i];
          if ((me >= tgt && me - op >= S.winBy) || (S.cap != null && me >= S.cap)) closeSet(ev.side, ev);
        }
        break;
      }
      case 'SET_WIN':
        if (!ev.side) break;
        if (phase === 'BREAK' && !matchOver()) openSet();
        if (phase !== 'PERIOD') break;
        closeSet(ev.side, ev);
        break;
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
      case 'ACTION': {
        const a = ev.payload as SportAction;
        if (!ev.side) break;
        stats.add(a.key, ev.side);
        if (a.kind === 'timeout') timeouts[ix(ev.side)] += 1;
        const athlete = name(input, ev.athleteId);
        let subtitle = athlete;
        if (a.kind === 'sub') subtitle = [athlete && `Sai ${athlete}`, name(input, ev.athlete2Id) && `Entra ${name(input, ev.athlete2Id)}`].filter(Boolean).join(' · ') || null;
        timeline.push({
          id: ev.id,
          seq: ev.seq,
          type: ev.type,
          side: ev.side,
          icon: actionIcon(a.kind, a.color),
          title: a.short ?? a.label,
          subtitle,
          minute: set ? `${S.label[0]}${set}` : null,
          at: ev.at,
          minor: a.kind === 'stat',
        });
        break;
      }
      default:
        break;
    }
  }

  const over = matchOver();
  const next: LifecycleAction[] = [];
  if (phase === 'PRE') next.push('START_MATCH');
  else if (phase === 'BREAK') next.push(over ? 'END_MATCH' : 'START_PERIOD');
  else if (phase === 'PERIOD' && over) next.push('END_MATCH');

  let winner: Side | 'draw' | null = null;
  if (phase === 'END') winner = wo ?? endWinner ?? winnerByScore(won[0], won[1]);

  const labels: Record<LivePhase, [string, string]> = {
    PRE: ['Pré-jogo', ''],
    PERIOD: [`${S.label} ${set}`, `${S.label[0]}${set}`],
    BREAK: over ? ['Fim do jogo?', 'FIM?'] : [`Fim do ${S.label.toLowerCase()} ${set}`, 'INT'],
    SHOOTOUT: ['', ''],
    END: ['Encerrado', 'FIM'],
  };

  return {
    status: phase === 'PRE' ? 'SCHEDULED' : phase === 'END' ? 'FINISHED' : 'LIVE',
    score: { home: won[0], away: won[1], periods: sets, timeouts: { home: timeouts[0], away: timeouts[1] } },
    live: {
      phase,
      period: set,
      isOvertime: false,
      periodLabel: labels[phase][0],
      shortLabel: labels[phase][1],
      clock: null,
      nextActions: next,
      suggestEnd: over && phase !== 'END',
    },
    winner,
    wo,
    timeline,
    stats: stats.rows(cfg, [
      { label: 'Pontos totais', home: pointsTotal[0], away: pointsTotal[1] },
    ]),
    highlight,
  };
}

export function buildSets(input: EngineInput, out: EngineOutput, cmd: MatchCommand): DraftEvent {
  const { phase, nextActions, suggestEnd } = out.live;
  const S = input.config.sets;
  switch (cmd.type) {
    case 'POINT':
      if (phase !== 'PERIOD' && phase !== 'BREAK') throw new EngineError('O jogo não está em andamento.');
      if (suggestEnd) throw new EngineError('A partida já tem vencedor — encerre o jogo.');
      if (S && S.target == null) throw new EngineError(`Nesta modalidade marque o ${S.label.toLowerCase()} vencido.`);
      return { type: 'POINT', side: requireSide(cmd), athleteId: cmd.athleteId ?? null, payload: {} };
    case 'SET_WIN':
      if (phase !== 'PERIOD' && phase !== 'BREAK') throw new EngineError('O jogo não está em andamento.');
      if (suggestEnd) throw new EngineError('A partida já tem vencedor — encerre o jogo.');
      return { type: 'SET_WIN', side: requireSide(cmd), payload: {} };
    case 'START_PERIOD':
      if (!nextActions.includes('START_PERIOD')) throw new EngineError('Não dá pra abrir outro set agora.');
      return { type: 'PERIOD_START', payload: {} };
    case 'ACTION': {
      const side = requireSide(cmd);
      const a = input.config.actions.find((x) => x.key === cmd.payload?.action);
      if (!a) throw new EngineError('Ação desconhecida para esta modalidade.');
      if (phase === 'PRE' || phase === 'END') throw new EngineError('O jogo não está em andamento.');
      const { key, label, kind, color, short } = a;
      return { type: 'ACTION', side, athleteId: cmd.athleteId ?? null, athlete2Id: kind === 'sub' ? (cmd.athlete2Id ?? null) : null, payload: { key, label, kind, color, short } };
    }
    default:
      throw new EngineError('Comando não suportado nesta modalidade.');
  }
}
