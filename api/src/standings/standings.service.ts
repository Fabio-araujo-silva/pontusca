import { Injectable, NotFoundException } from '@nestjs/common';
import type { ScoringRule } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { json } from '../common/util';
import { Coalescer, Payload } from '../common/payload';
import { LiveBus, LiveService } from '../live/live.service';
import type { Gender, MatchSummary, ModalityTable, ModalityTableRow, StandingRow, StandingsDTO } from '../shared/types';

interface Rule {
  win: number;
  draw: number;
  loss: number;
  woWin: number;
  woLoss: number;
  participation: number;
  placementPoints: number[];
  racePoints: number[];
  tiebreakers: string[];
}

const DEFAULT_RULE: Rule = {
  win: 3,
  draw: 1,
  loss: 0,
  woWin: 3,
  woLoss: 0,
  participation: 0,
  placementPoints: [],
  racePoints: [],
  tiebreakers: ['POINTS', 'WINS', 'SCORE_DIFF', 'SCORE_FOR', 'HEAD_TO_HEAD'],
};

const toRule = (r: ScoringRule): Rule => ({
  win: r.win,
  draw: r.draw,
  loss: r.loss,
  woWin: r.woWin,
  woLoss: r.woLoss,
  participation: r.participation,
  placementPoints: json<number[]>(r.placementPoints, []),
  racePoints: json<number[]>(r.racePoints, []),
  tiebreakers: json<string[]>(r.tiebreakers, DEFAULT_RULE.tiebreakers),
});

@Injectable()
export class StandingsService {
  private cache = new Map<string, { payload: Payload; gen: number }>();
  // versão por torneio: sobe quando algo que conta pontos muda
  private gen = new Map<string, number>();
  // último status/manual visto de cada jogo: lance de jogo AO VIVO não muda a classificação
  private seen = new Map<string, string>();
  private building = new Coalescer<Payload>();

  constructor(
    private prisma: PrismaService,
    private live: LiveService,
    bus: LiveBus,
  ) {
    bus.on('summary', (s: MatchSummary) => {
      const now = `${s.status}|${s.manual}|${s.status === 'FINISHED' ? `${s.score.home}:${s.score.away}:${s.winner}:${s.wo}:${s.seq}` : ''}`;
      const before = this.seen.get(s.id);
      this.seen.set(s.id, now);
      if (before !== now && (s.status === 'FINISHED' || before?.startsWith('FINISHED') || before === undefined)) this.touch(s.tournamentId);
    });
    bus.on('standings', (tid: string) => this.touch(tid));
    bus.on('feed', (p: { tournamentId: string }) => this.touch(p.tournamentId));
  }

  private touch(tid: string) {
    this.gen.set(tid, (this.gen.get(tid) ?? 0) + 1);
  }

  /** Classificação pronta pra servir; recalcula uma vez por versão, mesmo com mil pedidos juntos. */
  async payload(tournamentId: string) {
    const gen = this.gen.get(tournamentId) ?? 0;
    const c = this.cache.get(tournamentId);
    if (c && c.gen === gen) return c.payload;
    const payload = await this.building.run(`${tournamentId}:${gen}`, async () => new Payload(JSON.stringify(await this.compute(tournamentId))));
    if ((this.gen.get(tournamentId) ?? 0) === gen) this.cache.set(tournamentId, { payload, gen });
    return payload;
  }

  async compute(tournamentId: string): Promise<StandingsDTO> {
    const t = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!t) throw new NotFoundException('Torneio não encontrado.');
    const [matches, rules, placements, adjustments] = await Promise.all([
      this.prisma.match.findMany({ where: { tournamentId, countsForStandings: true }, select: { id: true, sportId: true, gender: true, group: true, homeId: true, awayId: true } }),
      this.prisma.scoringRule.findMany({ where: { tournamentId } }),
      this.prisma.placement.findMany({ where: { tournamentId } }),
      this.prisma.pointAdjustment.findMany({ where: { tournamentId } }),
    ]);
    const summaries = new Map((await Promise.all(matches.map((m) => this.live.summary(m.id).catch(() => null)))).filter((x): x is MatchSummary => !!x).map((x) => [x.id, x]));

    const ruleFor = (sportId: string, gender: string): Rule => {
      const r =
        rules.find((x) => x.sportId === sportId && x.gender === gender) ??
        rules.find((x) => x.sportId === sportId && !x.gender) ??
        rules.find((x) => !x.sportId && x.gender === gender) ??
        rules.find((x) => !x.sportId && !x.gender);
      return r ? toRule(r) : DEFAULT_RULE;
    };

    const rows = new Map<string, StandingRow>();
    const row = (id: string) => {
      let r = rows.get(id);
      if (!r) {
        r = { institutionId: id, position: 0, points: 0, matchPoints: 0, placementPoints: 0, racePoints: 0, adjustments: 0, gold: 0, silver: 0, bronze: 0, played: 0, wins: 0, draws: 0, losses: 0, scoreFor: 0, scoreAgainst: 0, bySport: [] };
        rows.set(id, r);
      }
      return r;
    };
    const addSport = (r: StandingRow, sportId: string, gender: Gender, pts: number, placement?: number) => {
      let s = r.bySport.find((x) => x.sportId === sportId && x.gender === gender);
      if (!s) r.bySport.push((s = { sportId, gender, points: 0, placement: null }));
      s.points += pts;
      if (placement != null) s.placement = placement;
    };

    // tabelas por modalidade/grupo
    const tables = new Map<string, { sportId: string; gender: Gender; group: string | null; rows: Map<string, ModalityTableRow>; games: { h: string; a: string; s: MatchSummary }[]; rule: Rule }>();

    for (const m of matches) {
      const s = summaries.get(m.id);
      if (!s || s.status !== 'FINISHED') continue;
      const gender = m.gender as Gender;
      const rule = ruleFor(m.sportId, m.gender);

      if (s.score.ranking?.length) {
        for (const rr of s.score.ranking) {
          if (!rr.position) continue;
          const pts = rule.racePoints[rr.position - 1] ?? 0;
          const r = row(rr.institutionId);
          r.racePoints += pts;
          addSport(r, m.sportId, gender, pts);
        }
        continue;
      }
      if (!m.homeId || !m.awayId || !s.winner) continue;
      const pair: [string, 'home' | 'away'][] = [
        [m.homeId, 'home'],
        [m.awayId, 'away'],
      ];
      for (const [inst, side] of pair) {
        const r = row(inst);
        const mine = side === 'home' ? s.score.home : s.score.away;
        const theirs = side === 'home' ? s.score.away : s.score.home;
        let pts = rule.participation;
        r.played += 1;
        if (!s.wo) {
          r.scoreFor += mine;
          r.scoreAgainst += theirs;
        }
        if (s.winner === 'draw') {
          r.draws += 1;
          pts += rule.draw;
        } else if (s.winner === side) {
          r.wins += 1;
          pts += s.wo ? rule.woWin : rule.win;
        } else {
          r.losses += 1;
          pts += s.wo ? rule.woLoss : rule.loss;
        }
        r.matchPoints += pts;
        addSport(r, m.sportId, gender, pts);
      }

      const key = `${m.sportId}|${gender}|${m.group ?? ''}`;
      let tb = tables.get(key);
      if (!tb) tables.set(key, (tb = { sportId: m.sportId, gender, group: m.group ?? null, rows: new Map(), games: [], rule }));
      tb.games.push({ h: m.homeId, a: m.awayId, s });
      for (const [inst, side] of pair) {
        let tr = tb.rows.get(inst);
        if (!tr) tb.rows.set(inst, (tr = { institutionId: inst, position: 0, points: 0, played: 0, wins: 0, draws: 0, losses: 0, scoreFor: 0, scoreAgainst: 0, diff: 0 }));
        const mine = side === 'home' ? s.score.home : s.score.away;
        const theirs = side === 'home' ? s.score.away : s.score.home;
        tr.played += 1;
        tr.scoreFor += mine;
        tr.scoreAgainst += theirs;
        tr.diff = tr.scoreFor - tr.scoreAgainst;
        if (s.winner === 'draw') {
          tr.draws += 1;
          tr.points += rule.draw;
        } else if (s.winner === side) {
          tr.wins += 1;
          tr.points += s.wo ? rule.woWin : rule.win;
        } else {
          tr.losses += 1;
          tr.points += s.wo ? rule.woLoss : rule.loss;
        }
      }
    }

    for (const p of placements) {
      const rule = ruleFor(p.sportId, p.gender);
      const pts = rule.placementPoints[p.position - 1] ?? 0;
      const r = row(p.institutionId);
      r.placementPoints += pts;
      if (p.position === 1) r.gold += 1;
      if (p.position === 2) r.silver += 1;
      if (p.position === 3) r.bronze += 1;
      addSport(r, p.sportId, p.gender as Gender, pts, p.position);
    }
    for (const a of adjustments) row(a.institutionId).adjustments += a.points;

    const list = [...rows.values()];
    for (const r of list) r.points = round(r.matchPoints + r.placementPoints + r.racePoints + r.adjustments);

    const tiebreakers = json<string[]>(t.tiebreakers, ['POINTS']);
    const val = (r: StandingRow, k: string): number => {
      switch (k) {
        case 'POINTS':
          return r.points;
        case 'GOLD':
          return r.gold;
        case 'SILVER':
          return r.silver;
        case 'BRONZE':
          return r.bronze;
        case 'WINS':
          return r.wins;
        case 'SCORE_DIFF':
          return r.scoreFor - r.scoreAgainst;
        case 'SCORE_FOR':
          return r.scoreFor;
        case 'FEWER_LOSSES':
          return -r.losses;
        default:
          return 0;
      }
    };
    const cmp = (a: StandingRow, b: StandingRow) => {
      for (const k of tiebreakers) {
        const d = val(b, k) - val(a, k);
        if (d) return d;
      }
      return 0;
    };
    list.sort(cmp);
    list.forEach((r, i) => (r.position = i > 0 && cmp(list[i - 1], r) === 0 ? list[i - 1].position : i + 1));

    const modalities: ModalityTable[] = [...tables.values()].map((tb) => {
      const trs = [...tb.rows.values()];
      const h2h = (a: string, b: string) => {
        let pa = 0;
        let pb = 0;
        for (const g of tb.games) {
          if (!((g.h === a && g.a === b) || (g.h === b && g.a === a))) continue;
          const aSide = g.h === a ? 'home' : 'away';
          if (g.s.winner === 'draw') {
            pa += 1;
            pb += 1;
          } else if (g.s.winner === aSide) pa += 3;
          else pb += 3;
        }
        return pa - pb;
      };
      const mc = (a: ModalityTableRow, b: ModalityTableRow) => {
        for (const k of tb.rule.tiebreakers) {
          let d = 0;
          if (k === 'POINTS') d = b.points - a.points;
          else if (k === 'WINS') d = b.wins - a.wins;
          else if (k === 'SCORE_DIFF') d = b.diff - a.diff;
          else if (k === 'SCORE_FOR') d = b.scoreFor - a.scoreFor;
          else if (k === 'FEWER_AGAINST') d = a.scoreAgainst - b.scoreAgainst;
          else if (k === 'HEAD_TO_HEAD') d = -h2h(a.institutionId, b.institutionId);
          if (d) return d;
        }
        return 0;
      };
      trs.sort(mc);
      trs.forEach((r, i) => (r.position = i > 0 && mc(trs[i - 1], r) === 0 ? trs[i - 1].position : i + 1));
      return { sportId: tb.sportId, gender: tb.gender, group: tb.group, rows: trs };
    });

    return { tournamentId, rows: list, modalities, updatedAt: Date.now() };
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
