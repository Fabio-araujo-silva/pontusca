import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { EventEmitter } from 'events';
import type { Athlete, Match, MatchEvent, MatchParticipant, MatchPlayer, Sport } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { json } from '../common/util';
import type { AuthUser } from '../auth/auth';
import { buildEvent, EngineError, EngineInput, EngineOutput, ManualResult, runEngine } from '../shared/engine';
import type { EngineEvent, Gender, Highlight, MatchCommand, MatchDetail, MatchSummary, PlayerView, Side, SportConfig } from '../shared/types';

/** Barramento interno: LiveService publica, gateway/feed/standings escutam. */
@Injectable()
export class LiveBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }
}

type MatchRow = Match & {
  sport: Sport;
  players: (MatchPlayer & { athlete: Athlete })[];
  participants: MatchParticipant[];
};

interface Entry {
  match: MatchRow;
  config: SportConfig;
  events: EngineEvent[];
  byClientId: Map<string, string>;
  names: Record<string, string>;
  out: EngineOutput;
  summary: MatchSummary;
  detailJson?: string;
}

const toEngineEvent = (e: MatchEvent): EngineEvent => ({
  id: e.id,
  seq: e.seq,
  type: e.type as EngineEvent['type'],
  side: (e.side as Side) ?? null,
  athleteId: e.athleteId,
  athlete2Id: e.athlete2Id,
  payload: json(e.payload, {}),
  period: e.period,
  clockMs: e.clockMs,
  at: e.createdAt.getTime(),
});

export const athleteLabel = (a: Pick<Athlete, 'name' | 'nickname'>) => a.nickname?.trim() || a.name;

@Injectable()
export class LiveService implements OnApplicationBootstrap {
  private log = new Logger('Live');
  private cache = new Map<string, Entry>();
  private locks = new Map<string, Promise<unknown>>();

  constructor(
    private prisma: PrismaService,
    private bus: LiveBus,
  ) {}

  /** No boot recalcula o placar de todos os jogos (garante cache coerente com o motor atual). */
  async onApplicationBootstrap() {
    const ids = await this.prisma.match.findMany({ select: { id: true } });
    for (const { id } of ids) {
      const e = await this.load(id);
      await this.persist(e);
    }
    this.log.log(`${ids.length} jogos carregados no cache ao vivo`);
  }

  // ------------------------------------------------------------------ leitura

  async summary(id: string) {
    return (await this.entry(id)).summary;
  }

  async detailJson(id: string) {
    const e = await this.entry(id);
    if (!e.detailJson) e.detailJson = JSON.stringify(this.detail(e));
    return e.detailJson;
  }

  async detailObj(id: string) {
    return this.detail(await this.entry(id));
  }

  /** Dados que o console do mesário precisa pra rodar o motor localmente. */
  async engineState(id: string) {
    const e = await this.entry(id);
    return {
      events: e.events,
      names: e.names,
      participants: e.match.participants.map((p) => ({ id: p.id, institutionId: p.institutionId, athleteName: p.athleteName, lane: p.lane })),
      manual: json<ManualResult | null>(e.match.manualResult, null),
      config: e.config,
    };
  }

  async raw(id: string) {
    return (await this.entry(id)).match;
  }

  // ------------------------------------------------------------------ escrita

  async command(user: AuthUser | null, id: string, cmd: MatchCommand) {
    return this.lock(id, async () => {
      const e = await this.entry(id);
      this.assertCanOperate(user, e.match);
      if (cmd.clientId && e.byClientId.has(cmd.clientId)) {
        // retry de um comando que já chegou (rede caiu na resposta): não duplica
        const evId = e.byClientId.get(cmd.clientId)!;
        return { summary: e.summary, event: e.events.find((x) => x.id === evId) ?? null, duplicate: true };
      }
      if (e.match.manualResult) throw new BadRequestException('Este jogo tem resultado lançado manualmente pelo admin.');
      if (e.match.status === 'POSTPONED' || e.match.status === 'CANCELED') throw new BadRequestException('Jogo adiado ou cancelado.');
      if (cmd.athleteId && !e.names[cmd.athleteId]) throw new BadRequestException('Atleta fora da escalação deste jogo.');
      if (cmd.athlete2Id && !e.names[cmd.athlete2Id]) throw new BadRequestException('Atleta fora da escalação deste jogo.');

      const now = Date.now();
      let draft;
      try {
        draft = buildEvent(this.input(e), e.out, cmd, now);
      } catch (err) {
        if (err instanceof EngineError) throw new BadRequestException(err.message);
        throw err;
      }
      const seq = e.match.seq + 1;
      const row = await this.prisma.matchEvent.create({
        data: {
          matchId: id,
          seq,
          clientId: cmd.clientId || null,
          type: draft.type,
          side: draft.side ?? null,
          athleteId: draft.athleteId ?? null,
          athlete2Id: draft.athlete2Id ?? null,
          payload: JSON.stringify(draft.payload ?? {}),
          period: draft.period ?? null,
          clockMs: draft.clockMs ?? null,
          createdById: user?.id ?? null,
          createdAt: new Date(now),
        },
      });
      const ev = toEngineEvent(row);
      e.events.push(ev);
      if (row.clientId) e.byClientId.set(row.clientId, row.id);
      e.match.seq = seq;
      this.compute(e);
      await this.persist(e);
      this.publish(e, e.out.highlight);
      return { summary: e.summary, event: ev, duplicate: false };
    });
  }

  /** Desfaz (anula) um evento. O placar é recalculado do zero sem ele. */
  async voidEvent(user: AuthUser | null, id: string, eventId: string) {
    return this.lock(id, async () => {
      const e = await this.entry(id);
      this.assertCanOperate(user, e.match);
      const row = await this.prisma.matchEvent.findFirst({ where: { id: eventId, matchId: id } });
      if (!row) throw new NotFoundException('Lance não encontrado.');
      if (!row.voided) {
        await this.prisma.matchEvent.update({ where: { id: eventId }, data: { voided: true, voidedAt: new Date(), voidedById: user?.id ?? null } });
        e.events = e.events.filter((x) => x.id !== eventId);
        this.compute(e);
        await this.persist(e);
        this.publish(e, null);
      }
      return { summary: e.summary };
    });
  }

  /**
   * Diz quem fez um lance já registrado (fluxo "marca primeiro, autor depois").
   * undefined = não mexe; null = limpa.
   */
  async assignAthlete(user: AuthUser | null, id: string, eventId: string, who: { athleteId?: string | null; athlete2Id?: string | null }) {
    return this.lock(id, async () => {
      const e = await this.entry(id);
      this.assertCanOperate(user, e.match);
      const ev = e.events.find((x) => x.id === eventId);
      if (!ev) throw new NotFoundException('Lance não encontrado (ou foi desfeito).');
      for (const a of [who.athleteId, who.athlete2Id]) if (a && !e.names[a]) throw new BadRequestException('Atleta fora da escalação deste jogo.');
      const data: { athleteId?: string | null; athlete2Id?: string | null } = {};
      if (who.athleteId !== undefined) data.athleteId = who.athleteId;
      if (who.athlete2Id !== undefined) data.athlete2Id = who.athlete2Id;
      await this.prisma.matchEvent.update({ where: { id: eventId }, data });
      Object.assign(ev, data);
      this.compute(e);
      await this.persist(e);
      this.publish(e, null);
      return { summary: e.summary, event: ev };
    });
  }

  /** Recarrega do banco depois de edição do admin (times, horário, escalação...). */
  async refresh(id: string, structural = false) {
    return this.lock(id, async () => {
      this.cache.delete(id);
      const exists = await this.prisma.match.findUnique({ where: { id }, select: { id: true, tournamentId: true, isSandbox: true } });
      if (!exists) return null;
      const e = await this.load(id);
      await this.persist(e);
      this.publish(e, null);
      if (structural) this.bus.emit('feed', { tournamentId: e.match.tournamentId, isSandbox: e.match.isSandbox });
      return e.summary;
    });
  }

  forget(id: string, tournamentId: string, isSandbox: boolean) {
    this.cache.delete(id);
    this.bus.emit('feed', { tournamentId, isSandbox });
    this.bus.emit('standings', tournamentId);
  }

  forgetMany(ids: string[]) {
    for (const id of ids) this.cache.delete(id);
  }

  canOperate(user: AuthUser | null, m: Pick<Match, 'mesarioId' | 'backupMesarioId' | 'backupEnabled' | 'isSandbox'>) {
    if (!user) return m.isSandbox; // simulador do sandbox
    if (user.role === 'ADMIN') return true;
    if (m.mesarioId === user.id) return true;
    return m.backupMesarioId === user.id && m.backupEnabled;
  }

  // ------------------------------------------------------------------ internos

  private assertCanOperate(user: AuthUser | null, m: Match) {
    if (this.canOperate(user, m)) return;
    if (user && m.backupMesarioId === user.id) throw new ForbiddenException('Você é o reserva: aguarde o admin liberar o registro.');
    throw new ForbiddenException('Você não é o mesário deste jogo.');
  }

  private async entry(id: string) {
    return this.cache.get(id) ?? (await this.load(id));
  }

  private async load(id: string): Promise<Entry> {
    const m = await this.prisma.match.findUnique({
      where: { id },
      include: {
        sport: true,
        players: { include: { athlete: true } },
        participants: { orderBy: [{ lane: 'asc' }, { id: 'asc' }] },
        events: { orderBy: { seq: 'asc' } },
      },
    });
    if (!m) throw new NotFoundException('Jogo não encontrado.');
    const { events: rows, ...match } = m;
    const names: Record<string, string> = {};
    for (const p of match.players) names[p.athleteId] = athleteLabel(p.athlete);
    // atletas que saíram da escalação mas têm lance registrado
    const missing = [...new Set(rows.flatMap((r) => [r.athleteId, r.athlete2Id]).filter((x): x is string => !!x && !names[x]))];
    if (missing.length) {
      const extra = await this.prisma.athlete.findMany({ where: { id: { in: missing } } });
      for (const a of extra) names[a.id] = athleteLabel(a);
    }
    const byClientId = new Map<string, string>();
    for (const r of rows) if (r.clientId) byClientId.set(r.clientId, r.id);
    const e = {
      match,
      config: json<SportConfig>(match.sport.config, { engine: 'SCORE', allowDraw: true, actions: [] }),
      events: rows.filter((r) => !r.voided).map(toEngineEvent),
      byClientId,
      names,
    } as Entry;
    this.compute(e);
    this.cache.set(id, e);
    return e;
  }

  private input(e: Entry): EngineInput {
    return {
      config: e.config,
      events: e.events,
      names: e.names,
      participants: e.match.participants.map((p) => ({ id: p.id, institutionId: p.institutionId, athleteName: p.athleteName, lane: p.lane })),
      manual: json<ManualResult | null>(e.match.manualResult, null),
    };
  }

  private compute(e: Entry) {
    const m = e.match;
    e.out = runEngine(this.input(e));
    e.detailJson = undefined;
    const last = [...e.out.timeline].reverse().find((t) => !t.minor);
    const frozen = m.status === 'POSTPONED' || m.status === 'CANCELED';
    e.summary = {
      id: m.id,
      tournamentId: m.tournamentId,
      sportId: m.sportId,
      gender: m.gender as Gender,
      phase: m.phase,
      group: m.group,
      venue: m.venue,
      title: m.title,
      scheduledAt: m.scheduledAt.toISOString(),
      status: frozen ? (m.status as MatchSummary['status']) : e.out.status,
      homeId: m.homeId,
      awayId: m.awayId,
      participantIds: m.participants.length ? [...new Set(m.participants.map((p) => p.institutionId))] : undefined,
      score: e.out.score,
      live: e.out.live,
      winner: e.out.winner,
      wo: e.out.wo,
      manual: !!m.manualResult,
      seq: m.seq,
      updatedAt: Date.now(),
      isSandbox: m.isSandbox,
      lastEvent: last ? { id: last.id, type: last.type, side: last.side ?? null, label: last.title, at: last.at } : null,
    };
  }

  private detail(e: Entry): MatchDetail {
    const view = (side: Side): PlayerView[] =>
      e.match.players
        .filter((p) => p.side === side)
        .map((p) => ({
          athleteId: p.athleteId,
          name: p.athlete.name,
          nickname: p.athlete.nickname,
          number: p.number,
          position: p.position,
          starter: p.starter,
          captain: p.captain,
          course: p.athlete.course,
        }))
        .sort((a, b) => Number(b.starter) - Number(a.starter) || (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name));
    return {
      ...e.summary,
      timeline: e.out.timeline,
      lineups: { home: view('home'), away: view('away') },
      participants: e.match.participants.map((p) => ({ id: p.id, institutionId: p.institutionId, athleteName: p.athleteName, lane: p.lane })),
      stats: e.out.stats,
      notes: e.match.notes,
    };
  }

  private async persist(e: Entry) {
    const m = e.match;
    const status = e.summary.status;
    const now = new Date();
    const startedAt = status === 'SCHEDULED' ? null : (m.startedAt ?? now);
    const finishedAt = status === 'FINISHED' ? (m.finishedAt ?? now) : null;
    const summaryJson = JSON.stringify(e.summary);
    if (m.summary === summaryJson && m.status === status) return;
    await this.prisma.match.update({ where: { id: m.id }, data: { status, seq: m.seq, summary: summaryJson, startedAt, finishedAt } });
    Object.assign(m, { status, summary: summaryJson, startedAt, finishedAt });
  }

  private publish(e: Entry, highlight: Highlight | null) {
    this.bus.emit('summary', e.summary, highlight);
  }

  private lock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => undefined);
    this.locks.set(id, tail);
    void tail.then(() => {
      if (this.locks.get(id) === tail) this.locks.delete(id);
    });
    return run;
  }
}
