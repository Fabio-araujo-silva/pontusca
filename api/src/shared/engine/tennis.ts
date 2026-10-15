// Motor TENNIS: tênis, beach tennis, padel. Ponto -> game -> set, com
// vantagem (ou ponto decisivo no-ad), tie-break, super tie-break no set
// decisivo e alternância de saque.
import type { Highlight, LifecycleAction, LivePhase, MatchCommand, Side, TimelineItem } from '../types';
import { DraftEvent, EngineError, EngineInput, EngineOutput, ix, lifecycleItem, other, requireSide, winnerByScore } from './common';

const CALLS = ['0', '15', '30', '40'];

export function reduceTennis(input: EngineInput): EngineOutput {
  const T = input.config.tennis ?? { bestOf: 3, gamesPerSet: 6, tiebreakAt: 6, tiebreakTarget: 7, superTiebreak: 10, noAd: false };
  const needed = Math.ceil(T.bestOf / 2);
  let phase = 'PRE' as LivePhase; // cast: closures mudam a fase e o TS não rastreia
  const sets: [number, number][] = [];
  const tbs: ([number, number] | null)[] = [];
  const won: [number, number] = [0, 0];
  let pts: [number, number] = [0, 0];
  let tiebreak = false;
  let superTb = false;
  let server: Side = 'home';
  let tbFirstServer: Side = 'home';
  let wo: Side | null = null;
  let endWinner: Side | 'draw' | null = null;
  const gamesWon: [number, number] = [0, 0];
  const pointsWon: [number, number] = [0, 0];
  const breaks: [number, number] = [0, 0];
  const timeline: TimelineItem[] = [];
  let highlight: Highlight | null = null;

  const over = () => won[0] >= needed || won[1] >= needed;
  const cur = () => sets[sets.length - 1];

  const newSet = () => {
    sets.push([0, 0]);
    tbs.push(null);
    pts = [0, 0];
    const deciding = sets.length === T.bestOf;
    superTb = deciding && T.superTiebreak != null;
    tiebreak = superTb;
    if (tiebreak) tbFirstServer = server;
  };

  const winSet = (side: Side, ev: any) => {
    won[ix(side)] += 1;
    const s = cur();
    timeline.push({ ...lifecycleItem(ev, `Set ${sets.length} — ${s[0]} x ${s[1]}${tbs[sets.length - 1] ? ` (${tbs[sets.length - 1]!.join('-')})` : ''}`), icon: 'set', side, scoreAfter: [won[0], won[1]] });
    highlight = { type: 'set', side, label: 'SET!', big: true };
    if (!over()) newSet();
  };

  const winGame = (side: Side, ev: any) => {
    const s = cur();
    const wasServer = server;
    s[ix(side)] += 1;
    gamesWon[ix(side)] += 1;
    if (side !== wasServer) breaks[ix(side)] += 1;
    pts = [0, 0];
    server = other(server);
    timeline.push({
      id: ev.id,
      seq: ev.seq,
      type: ev.type,
      side,
      icon: side !== wasServer ? 'break' : 'game',
      title: side !== wasServer ? 'Quebra de saque' : 'Game',
      minute: `S${sets.length}`,
      scoreAfter: [s[0], s[1]],
      at: ev.at,
    });
    highlight = { type: 'game', side, label: side !== wasServer ? 'QUEBROU!' : 'GAME', big: side !== wasServer };
    const me = s[ix(side)];
    const op = s[1 - ix(side)];
    if (me >= T.gamesPerSet && me - op >= 2) winSet(side, ev);
    else if (me === T.tiebreakAt && op === T.tiebreakAt) {
      tiebreak = true;
      tbFirstServer = server;
    }
  };

  for (const ev of input.events) {
    highlight = null;
    switch (ev.type) {
      case 'MATCH_START':
        phase = 'PERIOD';
        server = ev.payload.server === 'away' ? 'away' : 'home';
        newSet();
        timeline.push(lifecycleItem(ev, 'Início de jogo'));
        highlight = { type: 'start', label: 'COMEÇOU!' };
        break;
      case 'POINT': {
        if (phase !== 'PERIOD' || !ev.side || over()) break;
        const i = ix(ev.side);
        pts[i] += 1;
        pointsWon[i] += 1;
        highlight = { type: 'score', side: ev.side, label: 'PONTO', value: 1 };
        if (tiebreak) {
          const target = superTb ? T.superTiebreak! : T.tiebreakTarget;
          const n = pts[0] + pts[1];
          // saque no tie-break: 1 ponto, depois a cada 2
          server = Math.floor((n + 1) / 2) % 2 === 1 ? other(tbFirstServer) : tbFirstServer;
          if (pts[i] >= target && pts[i] - pts[1 - i] >= 2) {
            const s = cur();
            tbs[sets.length - 1] = [pts[0], pts[1]];
            if (superTb) s[i] = 1;
            else s[i] += 1;
            gamesWon[i] += 1;
            tiebreak = false;
            server = other(tbFirstServer);
            pts = [0, 0];
            winSet(ev.side, ev);
          }
        } else {
          const me = pts[i];
          const op = pts[1 - i];
          const wonGame = T.noAd ? me >= 4 : me >= 4 && me - op >= 2;
          if (wonGame) winGame(ev.side, ev);
          else if (!T.noAd && me >= 3 && op >= 3 && me === op) pts = [3, 3]; // volta pro iguais
        }
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

  const call = (i: number): string => {
    if (tiebreak) return String(pts[i]);
    const me = pts[i];
    const op = pts[1 - i];
    if (me >= 3 && op >= 3) return me > op ? 'AD' : '40';
    return CALLS[Math.min(me, 3)];
  };

  const next: LifecycleAction[] = [];
  if (phase === 'PRE') next.push('START_MATCH');
  else if (phase === 'PERIOD' && over()) next.push('END_MATCH');

  const setNo = sets.length;
  return {
    status: phase === 'PRE' ? 'SCHEDULED' : phase === 'END' ? 'FINISHED' : 'LIVE',
    score: {
      home: won[0],
      away: won[1],
      periods: sets,
      tennis: { sets, tiebreaks: tbs, game: phase === 'PERIOD' ? [call(0), call(1)] : ['', ''], tiebreak, server: phase === 'PERIOD' ? server : null },
    },
    live: {
      phase,
      period: setNo,
      isOvertime: false,
      periodLabel: phase === 'PERIOD' ? (tiebreak ? (superTb ? 'Super tie-break' : `Set ${setNo} · Tie-break`) : `Set ${setNo}`) : phase === 'END' ? 'Encerrado' : 'Pré-jogo',
      shortLabel: phase === 'PERIOD' ? (tiebreak ? 'TB' : `S${setNo}`) : phase === 'END' ? 'FIM' : '',
      clock: null,
      nextActions: next,
      suggestEnd: over() && phase !== 'END',
    },
    winner: phase === 'END' ? (wo ?? endWinner ?? winnerByScore(won[0], won[1])) : null,
    wo,
    timeline,
    stats: [
      { label: 'Games', home: gamesWon[0], away: gamesWon[1] },
      { label: 'Pontos ganhos', home: pointsWon[0], away: pointsWon[1] },
      { label: 'Quebras de saque', home: breaks[0], away: breaks[1] },
    ],
    highlight,
  };
}

export function buildTennis(input: EngineInput, out: EngineOutput, cmd: MatchCommand): DraftEvent {
  switch (cmd.type) {
    case 'POINT':
      if (out.live.phase !== 'PERIOD') throw new EngineError('O jogo não está em andamento.');
      if (out.live.suggestEnd) throw new EngineError('A partida já tem vencedor — encerre o jogo.');
      return { type: 'POINT', side: requireSide(cmd), payload: {} };
    default:
      throw new EngineError('Comando não suportado nesta modalidade.');
  }
}
