import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, AuthUser, CurrentUser, Roles } from '../auth/auth';
import { json, parse } from '../common/util';
import { LiveBus, LiveService } from '../live/live.service';
import { saveParticipants } from '../live/mesa.controller';
import { PrismaService } from '../prisma/prisma.service';

const MatchBody = z.object({
  tournamentId: z.string(),
  sportId: z.string(),
  gender: z.enum(['M', 'F', 'X']),
  phase: z.string().trim().max(40).nullish(),
  group: z.string().trim().max(12).nullish(),
  title: z.string().trim().max(60).nullish(),
  venue: z.string().trim().max(80).nullish(),
  scheduledAt: z.string().datetime({ offset: true }),
  homeId: z.string().nullish(),
  awayId: z.string().nullish(),
  mesarioId: z.string().nullish(),
  backupMesarioId: z.string().nullish(),
  countsForStandings: z.boolean().default(true),
  notes: z.string().max(500).nullish(),
  status: z.enum(['SCHEDULED', 'POSTPONED', 'CANCELED']).optional(),
  participants: z.array(z.object({ id: z.string().optional(), institutionId: z.string(), athleteName: z.string().max(80).nullish(), lane: z.number().int().min(0).max(99).nullish() })).max(80).optional(),
});

const ResultBody = z.object({
  home: z.number().min(0).max(9999),
  away: z.number().min(0).max(9999),
  winner: z.enum(['home', 'away', 'draw']).nullish(),
  note: z.string().max(200).nullish(),
});

@Controller('api/admin/matches')
@UseGuards(AuthGuard)
@Roles('ADMIN')
export class MatchesController {
  constructor(
    private prisma: PrismaService,
    private live: LiveService,
    private bus: LiveBus,
  ) {}

  @Get()
  async list(
    @Query('tournamentId') tournamentId?: string,
    @Query('sportId') sportId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('institutionId') institutionId?: string,
  ) {
    const rows = await this.prisma.match.findMany({
      where: {
        ...(tournamentId && { tournamentId }),
        ...(sportId && { sportId }),
        ...(status && { status }),
        ...(institutionId && { OR: [{ homeId: institutionId }, { awayId: institutionId }, { participants: { some: { institutionId } } }] }),
        ...((from || to) && { scheduledAt: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } }),
      },
      orderBy: { scheduledAt: 'asc' },
      take: 1000,
      include: { mesario: { select: { id: true, name: true } }, backupMesario: { select: { id: true, name: true } } },
    });
    return Promise.all(
      rows.map(async (r) => ({
        summary: await this.live.summary(r.id),
        mesario: r.mesario,
        backup: r.backupMesario,
        backupEnabled: r.backupEnabled,
        countsForStandings: r.countsForStandings,
        notes: r.notes,
      })),
    );
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const m = await this.prisma.match.findUnique({ where: { id }, include: { participants: { orderBy: { lane: 'asc' } } } });
    if (!m) throw new NotFoundException('Jogo não encontrado.');
    const { summary, events, ...rest } = m as any;
    return { match: { ...rest, manualResult: json(m.manualResult, null), scheduledAt: m.scheduledAt.toISOString() }, summary: await this.live.summary(id), detail: await this.live.detailObj(id) };
  }

  @Post()
  async create(@Body() body: unknown) {
    const b = parse(MatchBody, body);
    await this.validate(b);
    const m = await this.prisma.match.create({
      data: {
        tournamentId: b.tournamentId,
        sportId: b.sportId,
        gender: b.gender,
        phase: b.phase ?? null,
        group: b.group ?? null,
        title: b.title ?? null,
        venue: b.venue ?? null,
        scheduledAt: new Date(b.scheduledAt),
        homeId: b.homeId ?? null,
        awayId: b.awayId ?? null,
        mesarioId: b.mesarioId ?? null,
        backupMesarioId: b.backupMesarioId ?? null,
        countsForStandings: b.countsForStandings,
        notes: b.notes ?? null,
        status: b.status ?? 'SCHEDULED',
        isSandbox: (await this.prisma.tournament.findUnique({ where: { id: b.tournamentId } }))!.isSandbox,
      },
    });
    if (b.participants) await saveParticipants(this.prisma, m.id, b.participants);
    await this.importLineups(m.id);
    return this.live.refresh(m.id, true);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const cur = await this.prisma.match.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Jogo não encontrado.');
    const b = parse(MatchBody.partial(), body);
    const merged = { ...cur, ...b, scheduledAt: b.scheduledAt ?? cur.scheduledAt.toISOString() } as z.infer<typeof MatchBody>;
    await this.validate(merged, b.participants);
    const teamsChanged = (b.homeId !== undefined && b.homeId !== cur.homeId) || (b.awayId !== undefined && b.awayId !== cur.awayId);
    if (teamsChanged && cur.seq > 0) throw new BadRequestException('Jogo já tem lances: não dá pra trocar as equipes. Zere o jogo antes.');
    const { participants, ...data } = b;
    await this.prisma.match.update({ where: { id }, data: { ...data, ...(b.scheduledAt && { scheduledAt: new Date(b.scheduledAt) }) } });
    if (participants) await saveParticipants(this.prisma, id, participants);
    if (teamsChanged) {
      await this.prisma.matchPlayer.deleteMany({ where: { matchId: id } });
      await this.importLineups(id);
    }
    this.bus.emit('staff', id);
    return this.live.refresh(id, true);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const m = await this.prisma.match.delete({ where: { id } });
    this.live.forget(id, m.tournamentId, m.isSandbox);
    return { ok: true };
  }

  /** Libera (ou bloqueia) o mesário reserva de registrar AGORA. */
  @Post(':id/backup')
  async backup(@Param('id') id: string, @Body() body: unknown) {
    const { enabled } = parse(z.object({ enabled: z.boolean() }), body);
    await this.prisma.match.update({ where: { id }, data: { backupEnabled: enabled } });
    await this.live.refresh(id);
    this.bus.emit('staff', id);
    return { ok: true, backupEnabled: enabled };
  }

  /** Resultado manual (jogo passado sem súmula, correção, W.O. combinado...). */
  @Put(':id/result')
  async setResult(@Param('id') id: string, @Body() body: unknown) {
    const r = parse(ResultBody, body);
    await this.prisma.match.update({ where: { id }, data: { manualResult: JSON.stringify(r), status: 'FINISHED' } });
    await this.live.refresh(id);
    this.bus.emit('standings', (await this.live.raw(id)).tournamentId);
    return this.live.summary(id);
  }

  @Delete(':id/result')
  async clearResult(@Param('id') id: string) {
    await this.prisma.match.update({ where: { id }, data: { manualResult: null, status: 'SCHEDULED' } });
    await this.live.refresh(id);
    this.bus.emit('standings', (await this.live.raw(id)).tournamentId);
    return this.live.summary(id);
  }

  /** Zera o jogo: apaga todos os lances e volta pra "agendado". */
  @Post(':id/reset')
  async reset(@Param('id') id: string) {
    await this.prisma.$transaction([
      this.prisma.matchEvent.deleteMany({ where: { matchId: id } }),
      this.prisma.match.update({ where: { id }, data: { seq: 0, status: 'SCHEDULED', startedAt: null, finishedAt: null, manualResult: null } }),
    ]);
    return this.live.refresh(id, true);
  }

  /** Puxa o elenco cadastrado de cada atlética pra escalação do jogo (mantém o que já tem). */
  @Post(':id/import-lineups')
  async importLineupsRoute(@Param('id') id: string) {
    const n = await this.importLineups(id);
    await this.live.refresh(id);
    return { imported: n };
  }

  private async importLineups(id: string) {
    const m = await this.prisma.match.findUnique({ where: { id }, include: { players: true } });
    if (!m) return 0;
    let n = 0;
    for (const [side, inst] of [['home', m.homeId], ['away', m.awayId]] as const) {
      if (!inst) continue;
      const roster = await this.prisma.rosterEntry.findMany({ where: { sportId: m.sportId, gender: m.gender, athlete: { institutionId: inst } } });
      const have = new Set(m.players.map((p) => p.athleteId));
      const add = roster.filter((r) => !have.has(r.athleteId));
      if (add.length) {
        await this.prisma.matchPlayer.createMany({ data: add.map((r) => ({ matchId: id, athleteId: r.athleteId, side, number: r.number, position: r.position, starter: false })) });
        n += add.length;
      }
    }
    return n;
  }

  private async validate(b: z.infer<typeof MatchBody>, participants?: unknown[]) {
    const sport = await this.prisma.sport.findUnique({ where: { id: b.sportId } });
    if (!sport) throw new BadRequestException('Modalidade não encontrada.');
    const t = await this.prisma.tournament.findUnique({ where: { id: b.tournamentId } });
    if (!t) throw new BadRequestException('Torneio não encontrado.');
    if (sport.engine === 'RANKING') {
      if (!b.title) throw new BadRequestException('Dê um nome pra prova (ex.: 100m rasos).');
    } else {
      if (!b.homeId || !b.awayId) throw new BadRequestException('Escolha as duas atléticas.');
      if (b.homeId === b.awayId) throw new BadRequestException('Uma atlética não joga contra ela mesma.');
    }
    if (b.mesarioId && b.mesarioId === b.backupMesarioId) throw new BadRequestException('Titular e reserva precisam ser pessoas diferentes.');
    for (const uid of [b.mesarioId, b.backupMesarioId]) {
      if (!uid) continue;
      const u = await this.prisma.user.findUnique({ where: { id: uid }, include: { sports: true } });
      if (!u || !u.active) throw new BadRequestException('Mesário não encontrado ou desativado.');
      if (u.role === 'MESARIO' && !u.sports.some((s) => s.sportId === b.sportId)) throw new BadRequestException(`${u.name} não está habilitado(a) para ${sport.name}.`);
    }
    void participants;
  }
}

// ============================================================ dashboard

@Controller('api/admin/dashboard')
@UseGuards(AuthGuard)
@Roles('ADMIN')
export class DashboardController {
  constructor(
    private prisma: PrismaService,
    private live: LiveService,
  ) {}

  @Get()
  async get(@CurrentUser() _me: AuthUser, @Query('sandbox') sandbox?: string) {
    const now = Date.now();
    const isSandbox = sandbox === '1';
    const dayStart = new Date(now - 6 * 3600_000);
    const dayEnd = new Date(now + 18 * 3600_000);
    const rows = await this.prisma.match.findMany({
      where: { isSandbox, OR: [{ status: 'LIVE' }, { scheduledAt: { gte: dayStart, lte: dayEnd } }] },
      orderBy: { scheduledAt: 'asc' },
      include: { mesario: { select: { id: true, name: true } }, backupMesario: { select: { id: true, name: true } } },
    });
    const items = await Promise.all(rows.map(async (r) => ({ summary: await this.live.summary(r.id), mesario: r.mesario, backup: r.backupMesario, backupEnabled: r.backupEnabled })));
    const alerts: { level: 'warn' | 'danger'; matchId: string; message: string }[] = [];
    for (const it of items) {
      const s = it.summary;
      const t = new Date(s.scheduledAt).getTime();
      if (!it.mesario && s.status === 'SCHEDULED') alerts.push({ level: 'warn', matchId: s.id, message: 'Jogo sem mesário titular' });
      if (s.status === 'SCHEDULED' && t < now - 20 * 60_000) alerts.push({ level: 'danger', matchId: s.id, message: 'Horário passou e o jogo não foi iniciado' });
      if (s.status === 'LIVE' && now - s.updatedAt > 25 * 60_000) alerts.push({ level: 'warn', matchId: s.id, message: 'Ao vivo sem atualização há mais de 25 min' });
    }
    const [mesarios, institutions, sports, total] = await Promise.all([
      this.prisma.user.count({ where: { role: 'MESARIO', active: true } }),
      this.prisma.institution.count({ where: { isSandbox } }),
      this.prisma.sport.count({ where: { active: true } }),
      this.prisma.match.count({ where: { isSandbox } }),
    ]);
    return {
      live: items.filter((i) => i.summary.status === 'LIVE'),
      today: items.filter((i) => i.summary.status !== 'LIVE'),
      alerts,
      counts: { mesarios, institutions, sports, matches: total, live: items.filter((i) => i.summary.status === 'LIVE').length },
    };
  }
}
