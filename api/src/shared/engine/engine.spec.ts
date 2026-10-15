import { SPORTS_CATALOG } from '../sports-catalog';
import type { EngineEvent, MatchCommand, SportConfig } from '../types';
import { buildEvent, EngineError, EngineInput, formatClock, runEngine } from './index';

const cfg = (slug: string): SportConfig => SPORTS_CATALOG.find((s) => s.slug === slug)!.config;

/** Simula um mesário: aplica comandos em sequência como o LiveService faz. */
function play(config: SportConfig, cmds: Partial<MatchCommand>[], participants?: EngineInput['participants']) {
  const events: EngineEvent[] = [];
  let t = 1_000_000;
  for (const c of cmds) {
    t += 60_000;
    const input: EngineInput = { config, events, participants };
    const out = runEngine(input);
    const d = buildEvent(input, out, { clientId: String(events.length), ...c } as MatchCommand, t);
    events.push({ id: `e${events.length}`, seq: events.length + 1, at: t, ...d, payload: d.payload });
  }
  return { out: runEngine({ config, events, participants }), events };
}

describe('SCORE (futebol)', () => {
  const f = cfg('futebol');
  it('soma gols, gol contra credita o rival e fecha o jogo', () => {
    const { out } = play(f, [
      { type: 'START_MATCH' },
      { type: 'ACTION', side: 'home', payload: { action: 'goal' } },
      { type: 'ACTION', side: 'home', payload: { action: 'own_goal' } },
      { type: 'END_PERIOD' },
      { type: 'START_PERIOD' },
      { type: 'ACTION', side: 'away', payload: { action: 'yellow' } },
      { type: 'ACTION', side: 'home', payload: { action: 'goal' } },
      { type: 'END_MATCH' },
    ]);
    expect(out.score.home).toBe(2);
    expect(out.score.away).toBe(1);
    expect(out.score.periods).toEqual([[1, 1], [1, 0]]);
    expect(out.status).toBe('FINISHED');
    expect(out.winner).toBe('home');
    expect(out.stats.find((s) => s.label === 'Cartões amarelos' || s.label.startsWith('Cartão'))).toBeTruthy();
  });

  it('"Gols" é o total do placar e pênaltis do jogo aparecem como pênalti', () => {
    const { out } = play(f, [
      { type: 'START_MATCH' },
      { type: 'ACTION', side: 'home', payload: { action: 'goal' } },
      { type: 'ACTION', side: 'home', payload: { action: 'penalty_goal' } },
      { type: 'ACTION', side: 'away', payload: { action: 'own_goal' } }, // gol contra da visitante = gol da casa
      { type: 'ACTION', side: 'home', payload: { action: 'penalty_miss' } },
      { type: 'ACTION', side: 'away', payload: { action: 'goal' } },
    ]);
    const row = (l: string) => out.stats.find((s) => s.label === l);
    expect([row('Gols')?.home, row('Gols')?.away]).toEqual([3, 1]);
    expect([row('Pênaltis cobrados')?.home, row('Pênaltis convertidos')?.home]).toEqual([2, 1]);
    expect(row('Gols de pênalti')).toBeUndefined();
    expect(row('Gols contra')?.away).toBe(1);
    expect(out.timeline.find((t) => t.title === 'Gol de pênalti')?.icon).toBe('pen-goal');
  });

  it('oferece prorrogação e pênaltis depois do tempo normal e decide nos pênaltis', () => {
    const base: Partial<MatchCommand>[] = [{ type: 'START_MATCH' }, { type: 'END_PERIOD' }, { type: 'START_PERIOD' }, { type: 'END_PERIOD' }];
    const mid = play(f, base).out;
    expect(mid.live.nextActions).toEqual(expect.arrayContaining(['START_OVERTIME', 'START_SHOOTOUT', 'END_MATCH']));
    const kicks: Partial<MatchCommand>[] = [];
    for (let i = 0; i < 3; i++) {
      kicks.push({ type: 'SHOOTOUT_KICK', side: 'home', payload: { scored: true } });
      kicks.push({ type: 'SHOOTOUT_KICK', side: 'away', payload: { scored: false } });
    }
    const { out } = play(f, [...base, { type: 'START_SHOOTOUT' }, ...kicks]);
    expect(out.live.suggestEnd).toBe(true); // 3x0 com 2 cobranças restantes: decidido
    const { out: end } = play(f, [...base, { type: 'START_SHOOTOUT' }, ...kicks, { type: 'END_MATCH' }]);
    expect(end.winner).toBe('home');
  });

  it('não deixa marcar gol com o jogo parado', () => {
    expect(() => play(f, [{ type: 'ACTION', side: 'home', payload: { action: 'goal' } }])).toThrow(EngineError);
    expect(() => play(f, [{ type: 'START_MATCH' }, { type: 'END_PERIOD' }, { type: 'ACTION', side: 'home', payload: { action: 'goal' } }])).toThrow(EngineError);
  });

  it('mostra minuto com acréscimo', () => {
    const clock = { running: false, baseMs: 47 * 60000 + 5000, startedAt: null, direction: 'up' as const, durationMs: 45 * 60000, display: 'minute' as const, offsetMin: 45 };
    expect(formatClock(clock, 0)).toBe("90+3'");
  });

  it('tempo esquecido aberto não mostra acréscimo absurdo', () => {
    const clock = { running: false, baseMs: (45 + 622) * 60000, startedAt: null, direction: 'up' as const, durationMs: 45 * 60000, display: 'minute' as const, offsetMin: 45 };
    expect(formatClock(clock, 0)).toBe("90+'");
    expect(formatClock({ ...clock, baseMs: (45 + 29) * 60000 }, 0)).toBe("90+30'");
  });
});

describe('SCORE (basquete/lutas/xadrez)', () => {
  it('cesta de 3 vale 3 e relógio é regressivo', () => {
    const { out } = play(cfg('basquete'), [{ type: 'START_MATCH' }, { type: 'ACTION', side: 'away', payload: { action: 'three' } }]);
    expect(out.score.away).toBe(3);
    expect(out.live.clock?.direction).toBe('down');
  });
  it('ippon é decisivo', () => {
    const { out } = play(cfg('judo'), [{ type: 'START_MATCH' }, { type: 'ACTION', side: 'away', payload: { action: 'ippon' } }]);
    expect(out.live.suggestEnd).toBe(true);
    const end = play(cfg('judo'), [{ type: 'START_MATCH' }, { type: 'ACTION', side: 'away', payload: { action: 'ippon' } }, { type: 'END_MATCH' }]).out;
    expect(end.winner).toBe('away');
  });
  it('empate no xadrez dá ½ pra cada', () => {
    const { out } = play(cfg('xadrez'), [{ type: 'START_MATCH' }, { type: 'ACTION', side: 'home', payload: { action: 'board_draw' } }, { type: 'ACTION', side: 'home', payload: { action: 'board_win' } }]);
    expect([out.score.home, out.score.away]).toEqual([1.5, 0.5]);
  });
});

describe('SETS (vôlei)', () => {
  it('fecha set no 25 com 2 de vantagem e tie-break no 15', () => {
    const v = cfg('volei');
    const pts = (side: 'home' | 'away', n: number) => Array.from({ length: n }, () => ({ type: 'POINT' as const, side }));
    const { out } = play(v, [
      { type: 'START_MATCH' },
      ...pts('home', 24),
      ...pts('away', 24),
      ...pts('home', 2), // 26x24
      ...pts('away', 25), // set 2 abre sozinho -> 0x25
      ...pts('home', 15), // tie-break 15x0
    ]);
    expect(out.score.periods).toEqual([[26, 24], [0, 25], [15, 0]]);
    expect([out.score.home, out.score.away]).toEqual([2, 1]);
    expect(out.live.suggestEnd).toBe(true);
    expect(out.live.nextActions).toEqual(['END_MATCH']);
  });
  it('mapas de LoL fecham manualmente', () => {
    const { out } = play(cfg('lol'), [{ type: 'START_MATCH' }, { type: 'SET_WIN', side: 'away' }, { type: 'SET_WIN', side: 'away' }]);
    expect(out.score.away).toBe(2);
    expect(out.live.suggestEnd).toBe(true);
  });
});

describe('TENNIS', () => {
  it('conta 15/30/40, iguais/vantagem e fecha game', () => {
    const t = cfg('tenis');
    const P = (side: 'home' | 'away') => ({ type: 'POINT' as const, side });
    let r = play(t, [{ type: 'START_MATCH' }, P('home'), P('home'), P('home'), P('away'), P('away'), P('away')]).out;
    expect(r.score.tennis?.game).toEqual(['40', '40']);
    r = play(t, [{ type: 'START_MATCH' }, P('home'), P('home'), P('home'), P('away'), P('away'), P('away'), P('away')]).out;
    expect(r.score.tennis?.game).toEqual(['40', 'AD']);
    r = play(t, [{ type: 'START_MATCH' }, P('home'), P('home'), P('home'), P('away'), P('away'), P('away'), P('away'), P('away')]).out;
    expect(r.score.tennis?.sets[0]).toEqual([0, 1]);
    expect(r.score.tennis?.server).toBe('away');
  });
  it('vence 6x0 6x0 e sugere o fim', () => {
    const P = { type: 'POINT' as const, side: 'home' as const };
    const { out } = play(cfg('tenis'), [{ type: 'START_MATCH' }, ...Array.from({ length: 48 }, () => P)]);
    expect(out.score.periods).toEqual([[6, 0], [6, 0]]);
    expect(out.live.suggestEnd).toBe(true);
  });
});

describe('BASEBALL', () => {
  it('3 strikes = out, 3 outs vira a entrada, home run limpa as bases', () => {
    const b = cfg('beisebol');
    const S = { type: 'PITCH' as const, payload: { result: 'STRIKE' } };
    const { out } = play(b, [
      { type: 'START_MATCH' },
      S, S, S, // K
      { type: 'HIT', payload: { kind: '1B' } },
      { type: 'HIT', payload: { kind: 'HR' } }, // 2 corridas pro visitante
      { type: 'OUT' },
      { type: 'OUT' },
    ]);
    const bb = out.score.baseball!;
    expect(out.score.away).toBe(2);
    expect(bb.half).toBe('bottom');
    expect(bb.outs).toBe(0);
    expect(bb.innings.away[0]).toBe(2);
  });
});

describe('RANKING', () => {
  it('ordena por menor tempo', () => {
    const parts = [
      { id: 'p1', institutionId: 'a', athleteName: 'Ana' },
      { id: 'p2', institutionId: 'b', athleteName: 'Bia' },
    ];
    const { out } = play(
      cfg('natacao'),
      [
        { type: 'START_MATCH' },
        { type: 'RESULT', payload: { participantId: 'p1', value: '1:02.35' } },
        { type: 'RESULT', payload: { participantId: 'p2', value: '59,80' } },
      ],
      parts,
    );
    expect(out.score.ranking?.map((r) => r.participantId)).toEqual(['p2', 'p1']);
    expect(out.score.ranking?.[1].result).toBe('1:02.35');
  });
});

describe('catálogo', () => {
  it('toda modalidade roda o motor sem erro', () => {
    for (const s of SPORTS_CATALOG) {
      expect(() => play(s.config, [{ type: 'START_MATCH' }, { type: 'END_MATCH' }])).not.toThrow();
    }
  });
});
