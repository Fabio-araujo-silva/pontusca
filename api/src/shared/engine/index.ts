// Ponto de entrada do motor de placar. Puro TS: roda igual no Nest (fonte da
// verdade) e no navegador do mesário (atualização otimista enquanto a rede
// não confirma).
import type { MatchCommand } from '../types';
import { reduceBaseball, buildBaseball } from './baseball';
import { DraftEvent, EngineError, EngineInput, EngineOutput, applyManual, clockElapsed } from './common';
import { buildRanking, reduceRanking } from './ranking';
import { buildScore, reduceScore } from './score';
import { buildSets, reduceSets } from './sets';
import { buildTennis, reduceTennis } from './tennis';

export * from './common';
export { formatMark, parseMark } from './ranking';

const ENGINES = {
  SCORE: { reduce: reduceScore, build: buildScore },
  SETS: { reduce: reduceSets, build: buildSets },
  TENNIS: { reduce: reduceTennis, build: buildTennis },
  BASEBALL: { reduce: reduceBaseball, build: buildBaseball },
  RANKING: { reduce: reduceRanking, build: buildRanking },
} as const;

export function runEngine(input: EngineInput): EngineOutput {
  const e = ENGINES[input.config.engine] ?? ENGINES.SCORE;
  return applyManual(e.reduce(input), input.manual);
}

/**
 * Valida um comando contra o estado atual e devolve o rascunho do evento.
 * Lança EngineError com mensagem amigável quando o comando não faz sentido
 * ("o jogo não começou", "escolha o atleta"...).
 */
export function buildEvent(input: EngineInput, out: EngineOutput, cmd: MatchCommand, now: number): DraftEvent {
  const { phase } = out.live;
  let draft: DraftEvent;
  switch (cmd.type) {
    case 'START_MATCH':
      if (phase !== 'PRE') throw new EngineError('O jogo já começou.');
      draft = { type: 'MATCH_START', payload: input.config.engine === 'TENNIS' ? { server: cmd.payload?.server === 'away' ? 'away' : 'home' } : {} };
      break;
    case 'END_MATCH': {
      if (phase === 'PRE') throw new EngineError('O jogo nem começou.');
      if (phase === 'END') throw new EngineError('O jogo já foi encerrado.');
      const w = cmd.payload?.winner;
      draft = { type: 'MATCH_END', payload: w === 'home' || w === 'away' || w === 'draw' ? { winner: w } : {} };
      break;
    }
    case 'WO':
      if (phase === 'END') throw new EngineError('O jogo já foi encerrado.');
      if (cmd.side !== 'home' && cmd.side !== 'away') throw new EngineError('Escolha quem venceu por W.O.');
      draft = { type: 'WO', side: cmd.side, payload: {} };
      break;
    case 'NOTE': {
      const text = String(cmd.payload?.text ?? '').trim().slice(0, 280);
      if (!text) throw new EngineError('Escreva a observação.');
      draft = { type: 'NOTE', side: cmd.side ?? null, payload: { text } };
      break;
    }
    default: {
      if (phase === 'END') throw new EngineError('O jogo já foi encerrado.');
      const e = ENGINES[input.config.engine] ?? ENGINES.SCORE;
      draft = e.build(input, out, cmd);
    }
  }
  draft.period = out.live.period || null;
  draft.clockMs = out.live.clock ? Math.round(clockElapsed(out.live.clock, now)) : null;
  return draft;
}

export { EngineError };
export type { DraftEvent, EngineInput, EngineOutput };
