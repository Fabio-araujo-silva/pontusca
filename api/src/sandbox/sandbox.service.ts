// Sandbox: gera um torneio de mentira (isolado do público) e põe um "robô
// mesário" pra jogar partidas ao vivo. O robô usa exatamente o mesmo
// LiveService.command que os mesários de verdade -> testa a cadeia inteira
// (motor, banco, cache, WebSocket, animações do front).
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { Sport } from '@prisma/client';
import { json } from '../common/util';
import { LiveBus, LiveService } from '../live/live.service';
import { PrismaService } from '../prisma/prisma.service';
import type { MatchCommand, MatchDetail, MatchSummary, Side, SportConfig } from '../shared/types';

const FIRST = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Larissa', 'Lucas', 'Mariana', 'Matheus', 'Natália', 'Otávio', 'Paula', 'Rafael', 'Sofia', 'Thiago', 'Vitória', 'Yuri', 'Beatriz', 'Caio', 'Júlia', 'Pedro', 'Letícia', 'Gustavo', 'Camila', 'Leonardo'];
const LAST = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Lima', 'Carvalho', 'Ferreira', 'Rodrigues', 'Almeida', 'Costa', 'Gomes', 'Martins', 'Araújo', 'Barbosa', 'Ribeiro', 'Rocha', 'Dias', 'Teixeira', 'Moura'];
const NICKS = ['Tanque', 'Foguete', 'Mágico', 'Paredão', 'Formiga', 'Gringo', 'Baixinho', 'Xerife', 'Pantera', 'Tsunami'];
const VENUES = ['Ginásio Poliesportivo', 'Campo Principal', 'Quadra 2', 'Piscina Olímpica', 'Pista de Atletismo', 'Arena Coberta', 'Campo Society', 'Ginásio Auxiliar'];
const PHASES = ['Fase de grupos', 'Fase de grupos', 'Fase de grupos', 'Quartas de final', 'Semifinal', 'Final'];
const SANDBOX_TEAMS = [
  { name: 'Lobos', fullName: 'Atlética Lobos (sandbox)', primaryColor: '#1d4ed8', secondaryColor: '#facc15', flagPattern: 'diagonal' },
  { name: 'Falcões', fullName: 'Atlética Falcões (sandbox)', primaryColor: '#b91c1c', secondaryColor: '#ffffff', flagPattern: 'stripes' },
  { name: 'Tubarões', fullName: 'Atlética Tubarões (sandbox)', primaryColor: '#0f766e', secondaryColor: '#e2e8f0', flagPattern: 'chevron' },
  { name: 'Panteras', fullName: 'Atlética Panteras (sandbox)', primaryColor: '#111827', secondaryColor: '#f472b6', flagPattern: 'split' },
  { name: 'Corujas', fullName: 'Atlética Corujas (sandbox)', primaryColor: '#7c3aed', secondaryColor: '#fde68a', flagPattern: 'cross' },
  { name: 'Touros', fullName: 'Atlética Touros (sandbox)', primaryColor: '#ea580c', secondaryColor: '#1f2937', flagPattern: 'stripes' },
];
const RACE_TITLES: Record<string, string[]> = {
  natacao: ['50m livre', '100m costas', '50m borboleta', '4x50m medley'],
  'atletismo-pista': ['100m rasos', '400m rasos', '1500m', 'Revezamento 4x100m'],
  'atletismo-campo': ['Salto em distância', 'Arremesso de peso', 'Lançamento de dardo'],
  'corrida-rua': ['5 km', '10 km'],
  cheerleading: ['Final'],
  ginastica: ['Solo', 'Trave'],
  'tiro-com-arco': ['Recurvo 30m'],
};

const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(a: T[]) => a[rnd(a.length)];
const chance = (p: number) => Math.random() < p;
const shuffle = <T>(a: T[]) => a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
/** "força" estável do mandante em cada jogo, pros placares não serem sempre 50/50 */
const bias = (id: string) => 0.42 + ((id.charCodeAt(id.length - 1) + id.charCodeAt(id.length - 2)) % 17) / 100;

interface Plan {
  n: number; // ações no período atual
  limit: number; // ações até o fim do período
  period: number;
}

@Injectable()
export class SandboxService implements OnApplicationBootstrap, OnModuleDestroy {
  private log = new Logger('Sandbox');
  private timer: NodeJS.Timeout | null = null;
  private speed = 1;
  private busy = false;
  private plans = new Map<string, Plan>();
  private counters = { commands: 0, errors: 0, startedAt: 0, lastError: '' };

  constructor(
    private prisma: PrismaService,
    private live: LiveService,
    private bus: LiveBus,
  ) {}

  async onApplicationBootstrap() {
    if (process.env.SANDBOX_AUTOSTART !== '1') return;
    const has = await this.prisma.tournament.count({ where: { isSandbox: true } });
    if (!has) await this.generate({});
    this.start(2);
    this.log.warn('SANDBOX_AUTOSTART=1 -> simulador ligado');
  }

  onModuleDestroy() {
    this.stop();
  }

  async status() {
    const [tournaments, byStatus] = await Promise.all([
      this.prisma.tournament.findMany({ where: { isSandbox: true }, include: { _count: { select: { matches: true } } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.match.groupBy({ by: ['status'], where: { isSandbox: true }, _count: true }),
    ]);
    return {
      running: !!this.timer,
      speed: this.speed,
      ...this.counters,
      tournaments: tournaments.map((t) => ({ id: t.id, name: t.name, matches: t._count.matches })),
      byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count])),
    };
  }

  start(speed = 1) {
    this.speed = Math.max(0.25, Math.min(10, speed));
    if (this.timer) clearInterval(this.timer);
    this.counters.startedAt = Date.now();
    this.timer = setInterval(() => void this.tick(), Math.max(200, Math.round(2500 / this.speed)));
    return { running: true, speed: this.speed };
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    return { running: false };
  }

  // ---------------------------------------------------------------- geração

  async generate(opts: { matches?: number; live?: number; finished?: number; sportIds?: string[] }) {
    const total = Math.max(1, Math.min(80, opts.matches ?? 18));
    const liveN = Math.min(total, opts.live ?? 5);
    const finishedN = Math.min(total - liveN, opts.finished ?? 5);
    const now = Date.now();

    const t = await this.prisma.tournament.create({
      data: {
        name: `Sandbox ${new Date(now).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
        slug: `sandbox-${now.toString(36)}`,
        edition: 'teste',
        isSandbox: true,
        startsAt: new Date(now - 86400_000),
        endsAt: new Date(now + 3 * 86400_000),
        color: '#f59e0b',
      },
    });
    await this.prisma.scoringRule.create({ data: { tournamentId: t.id, placementPoints: '[13,10,8,6,4,2,1]', racePoints: '[9,7,6,5,4,3,2,1]' } });

    let insts = await this.prisma.institution.findMany({ where: { isSandbox: false } });
    if (insts.length < 4) {
      const existing = await this.prisma.institution.findMany({ where: { isSandbox: true } });
      for (const s of SANDBOX_TEAMS) {
        if (existing.some((e) => e.name === s.name)) continue;
        await this.prisma.institution.create({ data: { ...s, slug: `sb-${s.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}`, university: 'Universidade Sandbox', isSandbox: true } });
      }
      insts = [...insts, ...(await this.prisma.institution.findMany({ where: { isSandbox: true } }))];
    }

    let sports = await this.prisma.sport.findMany({ where: { active: true, ...(opts.sportIds?.length && { id: { in: opts.sportIds } }) } });
    if (!sports.length) throw new Error('Nenhuma modalidade ativa.');
    // garante variedade: um de cada motor primeiro
    const engines = [...new Set(sports.map((s) => s.engine))];
    const firsts = engines.map((e) => pick(sports.filter((s) => s.engine === e)));
    const order = [...shuffle(firsts), ...Array.from({ length: total }, () => pick(sports))].slice(0, total);
    sports = order;

    const ids: string[] = [];
    for (let i = 0; i < total; i++) {
      const sport = sports[i];
      const cfg = json<SportConfig>(sport.config, { engine: 'SCORE', allowDraw: true, actions: [] });
      const gender = pick(sport.genders.split(','));
      const bucket = i < finishedN ? 'finished' : i < finishedN + liveN ? 'live' : 'future';
      const scheduledAt =
        bucket === 'finished'
          ? new Date(now - (i + 1) * 75 * 60_000)
          : bucket === 'live'
            ? new Date(now - rnd(30) * 60_000)
            : new Date(roundHour(now + (1 + rnd(70)) * 3600_000));
      const phase = pick(PHASES);
      const base = {
        tournamentId: t.id,
        sportId: sport.id,
        gender,
        phase,
        group: phase === 'Fase de grupos' ? pick(['A', 'B']) : null,
        venue: pick(VENUES),
        scheduledAt,
        isSandbox: true,
      };
      let id: string;
      if (cfg.engine === 'RANKING') {
        const m = await this.prisma.match.create({ data: { ...base, title: pick(RACE_TITLES[sport.slug] ?? ['Final']), phase: 'Final', group: null } });
        id = m.id;
        const n = Math.min(insts.length, 4 + rnd(5));
        const chosen = shuffle(insts).slice(0, n);
        await this.prisma.matchParticipant.createMany({ data: chosen.map((inst, lane) => ({ matchId: id, institutionId: inst.id, athleteName: personName(), lane: lane + 1 })) });
      } else {
        const [home, away] = shuffle(insts).slice(0, 2);
        const m = await this.prisma.match.create({ data: { ...base, homeId: home.id, awayId: away.id } });
        id = m.id;
        const size = Math.max(2, Math.min(16, (cfg.lineup?.starters ?? 5) + (cfg.lineup?.starters && cfg.lineup.starters > 2 ? 4 : 0)));
        for (const [side, inst] of [['home', home], ['away', away]] as const) {
          const positions = cfg.lineup?.positions ?? [];
          for (let k = 0; k < size; k++) {
            const a = await this.prisma.athlete.create({ data: { institutionId: inst.id, name: personName(), nickname: chance(0.15) ? pick(NICKS) : null, isSandbox: true } });
            const number = k + 1 + (k > 9 ? rnd(80) : 0);
            await this.prisma.matchPlayer.create({ data: { matchId: id, athleteId: a.id, side, number, starter: k < (cfg.lineup?.starters ?? size), captain: k === 0, position: positions.length ? positions[Math.min(k, positions.length - 1)] : null } });
          }
        }
      }
      ids.push(id);
      await this.live.refresh(id);
    }

    for (let i = 0; i < ids.length; i++) {
      if (i < finishedN) await this.fastForward(ids[i], Infinity);
      else if (i < finishedN + liveN) await this.fastForward(ids[i], 4 + rnd(25));
    }
    this.bus.emit('feed', { tournamentId: t.id, isSandbox: true });
    this.bus.emit('catalog');
    return { tournamentId: t.id, created: ids.length };
  }

  async clear() {
    this.stop();
    const ts = await this.prisma.tournament.findMany({ where: { isSandbox: true }, select: { id: true } });
    const ms = await this.prisma.match.findMany({ where: { isSandbox: true }, select: { id: true } });
    this.live.forgetMany(ms.map((m) => m.id));
    await this.prisma.match.deleteMany({ where: { isSandbox: true } });
    await this.prisma.tournament.deleteMany({ where: { isSandbox: true } });
    await this.prisma.athlete.deleteMany({ where: { isSandbox: true } });
    await this.prisma.institution.deleteMany({ where: { isSandbox: true } });
    this.plans.clear();
    this.counters = { commands: 0, errors: 0, startedAt: 0, lastError: '' };
    for (const t of ts) this.bus.emit('feed', { tournamentId: t.id, isSandbox: true });
    this.bus.emit('catalog');
    return { tournaments: ts.length, matches: ms.length };
  }

  // ---------------------------------------------------------------- simulação

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const rows = await this.prisma.match.findMany({ where: { isSandbox: true, status: { in: ['LIVE', 'SCHEDULED'] } }, select: { id: true, status: true, scheduledAt: true }, orderBy: { scheduledAt: 'asc' } });
      const now = Date.now();
      const liveRows = rows.filter((r) => r.status === 'LIVE');
      for (const r of liveRows) if (chance(0.7)) await this.step(r.id);
      for (const r of rows) if (r.status === 'SCHEDULED' && r.scheduledAt.getTime() <= now) await this.step(r.id);
      // mantém o sandbox animado: se quase nada ao vivo, puxa o próximo agendado
      if (liveRows.length < 2 && chance(0.08)) {
        const nxt = rows.find((r) => r.status === 'SCHEDULED');
        if (nxt) await this.step(nxt.id);
      }
    } catch (e: any) {
      this.counters.errors++;
      this.counters.lastError = e?.message ?? String(e);
    } finally {
      this.busy = false;
    }
  }

  /** Executa um passo de simulação; devolve false se o jogo acabou. */
  private async step(id: string, offline = false): Promise<boolean> {
    const s = await this.live.summary(id);
    if (s.status === 'FINISHED' || s.status === 'CANCELED' || s.status === 'POSTPONED') return false;
    const raw = await this.live.raw(id);
    const cfg = json<SportConfig>(raw.sport.config, { engine: 'SCORE', allowDraw: true, actions: [] });
    const detail = await this.live.detailObj(id);
    const cmds = this.next(s, cfg, detail, raw.sport, offline);
    for (const c of cmds) {
      try {
        await this.live.command(null, id, { clientId: `sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, ...c } as MatchCommand);
        this.counters.commands++;
      } catch (e: any) {
        this.counters.errors++;
        this.counters.lastError = e?.message ?? String(e);
        return true;
      }
    }
    return true;
  }

  private async fastForward(id: string, steps: number) {
    for (let i = 0; i < Math.min(steps, 3000); i++) if (!(await this.step(id, true))) break;
  }

  private next(s: MatchSummary, cfg: SportConfig, d: MatchDetail, sport: Sport, offline: boolean): Partial<MatchCommand>[] {
    const L = s.live;
    if (L.phase === 'PRE') return [{ type: 'START_MATCH', payload: cfg.engine === 'TENNIS' ? { server: chance(0.5) ? 'home' : 'away' } : {} }];
    if (L.suggestEnd && L.nextActions.includes('END_MATCH')) return [{ type: 'END_MATCH' }];
    const sideBias = bias(s.id);
    const side = (): Side => (Math.random() < sideBias ? 'home' : 'away');
    const player = (sd: Side, starter = true) => {
      const list = d.lineups[sd].filter((p) => p.starter === starter);
      const pool = list.length ? list : d.lineups[sd];
      return pool.length ? pick(pool).athleteId : null;
    };

    switch (cfg.engine) {
      case 'SETS': {
        if (L.phase === 'BREAK') return L.nextActions.includes('START_PERIOD') ? [{ type: 'START_PERIOD' }] : [{ type: 'END_MATCH' }];
        if (cfg.sets?.target == null) return chance(offline ? 1 : 0.15) ? [{ type: 'SET_WIN', side: side() }] : [];
        if (chance(0.01) && cfg.actions.some((a) => a.kind === 'timeout')) return [{ type: 'ACTION', side: side(), payload: { action: 'timeout' } }];
        return [{ type: 'POINT', side: side() }];
      }
      case 'TENNIS': {
        const server = s.score.tennis?.server ?? 'home';
        const p = server === 'home' ? 0.62 : 0.38;
        return [{ type: 'POINT', side: Math.random() < (p + sideBias - 0.5) ? 'home' : 'away' }];
      }
      case 'BASEBALL': {
        const r = Math.random();
        if (r < 0.3) return [{ type: 'PITCH', payload: { result: 'BALL' } }];
        if (r < 0.57) return [{ type: 'PITCH', payload: { result: 'STRIKE' } }];
        if (r < 0.66) return [{ type: 'PITCH', payload: { result: 'FOUL' } }];
        if (r < 0.82) return [{ type: 'OUT' }];
        if (r < 0.92) return [{ type: 'HIT', payload: { kind: '1B' } }];
        if (r < 0.955) return [{ type: 'HIT', payload: { kind: '2B' } }];
        if (r < 0.962) return [{ type: 'HIT', payload: { kind: '3B' } }];
        if (r < 0.978) return [{ type: 'HIT', payload: { kind: 'HR' } }];
        if (r < 0.99) return [{ type: 'ERROR' }];
        return [{ type: 'RUN' }];
      }
      case 'RANKING': {
        const rows = s.score.ranking ?? [];
        const pending = rows.filter((r) => !r.status);
        if (!pending.length) return [{ type: 'END_MATCH' }];
        if (!offline && !chance(0.5)) return [];
        const p = pick(pending);
        if (chance(0.04)) return [{ type: 'RESULT', payload: { participantId: p.participantId, status: pick(['DNF', 'DQ']) } }];
        return [{ type: 'RESULT', payload: { participantId: p.participantId, value: raceMark(sport.slug, cfg, s.title ?? '') } }];
      }
      default:
        return this.nextScore(s, cfg, d, side, player);
    }
  }

  private nextScore(s: MatchSummary, cfg: SportConfig, _d: MatchDetail, side: () => Side, player: (sd: Side, starter?: boolean) => string | null): Partial<MatchCommand>[] {
    const L = s.live;
    const tie = s.score.home === s.score.away;
    if (L.phase === 'BREAK') {
      if (L.nextActions.includes('START_PERIOD')) return [{ type: 'START_PERIOD' }];
      if (tie && L.nextActions.includes('START_OVERTIME') && chance(0.6)) return [{ type: 'START_OVERTIME' }];
      if (tie && L.nextActions.includes('START_SHOOTOUT')) return [{ type: 'START_SHOOTOUT' }];
      return [{ type: 'END_MATCH' }];
    }
    if (L.phase === 'SHOOTOUT') {
      const kicks = s.score.shootout?.kicks ?? [];
      if (kicks.length > 30) return [{ type: 'END_MATCH' }];
      const sd: Side = kicks.length % 2 === 0 ? 'home' : 'away';
      return [{ type: 'SHOOTOUT_KICK', side: sd, athleteId: player(sd), payload: { scored: chance(0.74) } }];
    }
    // período em andamento
    let plan = this.plans.get(s.id);
    if (!plan || plan.period !== L.period) {
      const scoreHeavy = cfg.actions.some((a) => a.kind === 'score' && (a.value ?? 1) >= 2);
      plan = { n: 0, limit: (scoreHeavy ? 22 : 9) + rnd(scoreHeavy ? 14 : 8), period: L.period };
      if (L.isOvertime) plan.limit = Math.ceil(plan.limit / 2);
      this.plans.set(s.id, plan);
    }
    plan.n++;
    const out: Partial<MatchCommand>[] = [];
    const clock = L.clock;
    if (clock?.durationMs) out.push({ type: 'CLOCK_SET', payload: { ms: Math.min(clock.durationMs + 120_000, Math.round((plan.n / plan.limit) * clock.durationMs)) } });
    if (plan.n >= plan.limit) {
      if (L.nextActions.includes('END_PERIOD') && (!L.nextActions.includes('END_MATCH') || (tie && chance(0.7)))) out.push({ type: 'END_PERIOD' });
      else if (L.nextActions.includes('END_MATCH')) out.push({ type: 'END_MATCH' });
      else if (L.nextActions.includes('END_PERIOD')) out.push({ type: 'END_PERIOD' });
      return out;
    }
    const weighted = cfg.actions.flatMap((a) => {
      const w =
        a.kind === 'score'
          ? a.decisive
            ? 0.12
            : (a.value ?? 1) >= 2
              ? 3.5
              : a.against
                ? 0.15
                : 2.4
          : a.kind === 'card'
            ? a.color === 'red'
              ? 0.12
              : 0.6
            : a.kind === 'foul'
              ? 1.2
              : a.kind === 'sub'
                ? plan!.n > plan!.limit / 2
                  ? 0.9
                  : 0.1
                : a.kind === 'timeout'
                  ? 0.2
                  : 1;
      return [[a, w] as const];
    });
    const sum = weighted.reduce((acc, [, w]) => acc + w, 0);
    let r = Math.random() * sum;
    const a = weighted.find(([, w]) => (r -= w) <= 0)?.[0];
    if (!a) return out;
    const sd = side();
    out.push({
      type: 'ACTION',
      side: sd, // em gol contra o lado é de quem fez; o motor credita o rival
      athleteId: a.athlete === 'none' ? null : player(sd),
      athlete2Id: a.kind === 'sub' ? player(sd, false) : null,
      payload: { action: a.key },
    });
    return out;
  }
}

function personName() {
  return `${pick(FIRST)} ${pick(LAST)}`;
}

function roundHour(ms: number) {
  const d = new Date(ms);
  d.setMinutes(rnd(4) * 15, 0, 0);
  return d.getTime();
}

function raceMark(slug: string, cfg: SportConfig, title: string) {
  const f = cfg.ranking?.format;
  if (f === 'decimal' && cfg.ranking?.unit === 'm') return +(title.includes('peso') ? 8 + Math.random() * 6 : title.includes('dardo') ? 30 + Math.random() * 25 : 4.5 + Math.random() * 2.8).toFixed(2);
  if (f === 'decimal') return +(60 + Math.random() * 35).toFixed(2);
  if (f === 'integer') return 220 + rnd(90);
  const t = title.toLowerCase();
  const base = t.includes('1500') ? 260 : t.includes('400') ? 52 : t.includes('100m') && slug.startsWith('atletismo') ? 10.8 : t.includes('4x100') ? 44 : t.includes('10 km') ? 2400 : t.includes('5 km') ? 1150 : t.includes('100m') ? 62 : t.includes('4x50') ? 115 : 26;
  return +(base * (1 + Math.random() * 0.22)).toFixed(2);
}
