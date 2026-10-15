import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, AuthUser, CurrentUser, Roles } from '../auth/auth';
import { toInstitution, toSport, toTournament } from '../common/mappers';
import { parse } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import type { MatchCommand } from '../shared/types';
import { LiveService } from './live.service';

const Command = z.object({
  clientId: z.string().min(1).max(64),
  type: z.string().min(1).max(40),
  side: z.enum(['home', 'away']).nullish(),
  athleteId: z.string().max(40).nullish(),
  athlete2Id: z.string().max(40).nullish(),
  payload: z.record(z.any()).optional(),
});

const Lineup = z.object({
  side: z.enum(['home', 'away']),
  players: z
    .array(
      z.object({
        athleteId: z.string(),
        number: z.number().int().min(0).max(999).nullish(),
        position: z.string().max(12).nullish(),
        starter: z.boolean().default(false),
        captain: z.boolean().default(false),
      }),
    )
    .max(60),
});

const QuickAthlete = z.object({
  side: z.enum(['home', 'away']),
  name: z.string().trim().min(2, 'nome muito curto').max(80),
  nickname: z.string().trim().max(40).nullish(),
  number: z.number().int().min(0).max(999).nullish(),
  position: z.string().max(12).nullish(),
  starter: z.boolean().default(false),
});

const Participants = z.object({
  participants: z
    .array(
      z.object({
        id: z.string().optional(),
        institutionId: z.string(),
        athleteName: z.string().trim().max(80).nullish(),
        lane: z.number().int().min(0).max(99).nullish(),
      }),
    )
    .max(80),
});

@Controller('api/mesa')
@UseGuards(AuthGuard)
@Roles('ADMIN', 'MESARIO')
export class MesaController {
  constructor(
    private prisma: PrismaService,
    private live: LiveService,
  ) {}

  /** Jogos do mesário (titular ou reserva). Admin vê os de hoje/ao vivo de todo mundo. */
  @Get('matches')
  async list(@CurrentUser() user: AuthUser) {
    const since = new Date(Date.now() - 36 * 3600_000);
    const where =
      user.role === 'ADMIN'
        ? { OR: [{ status: 'LIVE' }, { scheduledAt: { gte: since, lte: new Date(Date.now() + 36 * 3600_000) } }] }
        : { OR: [{ mesarioId: user.id }, { backupMesarioId: user.id }], NOT: { AND: [{ status: 'FINISHED' }, { finishedAt: { lt: since } }] } };
    const rows = await this.prisma.match.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      take: 200,
      select: { id: true, mesarioId: true, backupMesarioId: true, backupEnabled: true, isSandbox: true, home: true, away: true },
    });
    return Promise.all(
      rows.map(async (r) => ({
        summary: await this.live.summary(r.id),
        // atléticas junto: as de sandbox não vêm no bootstrap público
        home: r.home ? toInstitution(r.home) : null,
        away: r.away ? toInstitution(r.away) : null,
        role: r.mesarioId === user.id ? 'primary' : r.backupMesarioId === user.id ? 'backup' : 'admin',
        backupEnabled: r.backupEnabled,
        canOperate: this.live.canOperate(user, r),
      })),
    );
  }

  @Get('matches/:id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const m = await this.live.raw(id);
    const isStaff = user.role === 'ADMIN' || m.mesarioId === user.id || m.backupMesarioId === user.id;
    if (!isStaff) throw new ForbiddenException('Você não está escalado neste jogo.');
    const [detail, engine, tournament, home, away, roster, mesario, backup] = await Promise.all([
      this.live.detailObj(id),
      this.live.engineState(id),
      this.prisma.tournament.findUnique({ where: { id: m.tournamentId } }),
      m.homeId ? this.prisma.institution.findUnique({ where: { id: m.homeId } }) : null,
      m.awayId ? this.prisma.institution.findUnique({ where: { id: m.awayId } }) : null,
      this.roster(m.sportId, m.gender, [m.homeId, m.awayId]),
      m.mesarioId ? this.prisma.user.findUnique({ where: { id: m.mesarioId }, select: { id: true, name: true } }) : null,
      m.backupMesarioId ? this.prisma.user.findUnique({ where: { id: m.backupMesarioId }, select: { id: true, name: true } }) : null,
    ]);
    return {
      detail,
      engine,
      meta: {
        role: m.mesarioId === user.id ? 'primary' : m.backupMesarioId === user.id ? 'backup' : 'admin',
        canOperate: this.live.canOperate(user, m),
        backupEnabled: m.backupEnabled,
        sport: toSport(m.sport),
        tournament: tournament ? toTournament(tournament) : null,
        home: home ? toInstitution(home) : null,
        away: away ? toInstitution(away) : null,
        mesario,
        backup,
        roster: { home: m.homeId ? roster[m.homeId] ?? [] : [], away: m.awayId ? roster[m.awayId] ?? [] : [] },
      },
    };
  }

  @Post('matches/:id/commands')
  @Header('Cache-Control', 'no-store')
  command(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const cmd = parse(Command, body) as MatchCommand;
    return this.live.command(user, id, cmd);
  }

  @Post('matches/:id/events/:eventId/void')
  voidEvent(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('eventId') eventId: string) {
    return this.live.voidEvent(user, id, eventId);
  }

  /** Atribui (ou corrige) o atleta de um lance já registrado. */
  @Patch('matches/:id/events/:eventId')
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('eventId') eventId: string, @Body() body: unknown) {
    const b = parse(z.object({ athleteId: z.string().max(40).nullish(), athlete2Id: z.string().max(40).nullish() }), body);
    return this.live.assignAthlete(user, id, eventId, b);
  }

  @Put('matches/:id/lineup')
  async lineup(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const { side, players } = parse(Lineup, body);
    const m = await this.assertOperate(user, id);
    const instId = side === 'home' ? m.homeId : m.awayId;
    if (!instId) throw new BadRequestException('Este jogo não tem esse lado.');
    const ids = [...new Set(players.map((p) => p.athleteId))];
    const valid = await this.prisma.athlete.count({ where: { id: { in: ids }, institutionId: instId } });
    if (valid !== ids.length) throw new BadRequestException('Há atletas que não são desta atlética.');
    await this.prisma.$transaction([
      this.prisma.matchPlayer.deleteMany({ where: { matchId: id, side } }),
      this.prisma.matchPlayer.createMany({
        data: players
          .filter((p, i) => players.findIndex((q) => q.athleteId === p.athleteId) === i)
          .map((p) => ({ matchId: id, side, athleteId: p.athleteId, number: p.number ?? null, position: p.position ?? null, starter: p.starter, captain: p.captain })),
      }),
    ]);
    await this.live.refresh(id);
    return this.live.detailObj(id);
  }

  /** Cadastro relâmpago de atleta na beira da quadra: entra no elenco e na escalação. */
  @Post('matches/:id/athletes')
  async quickAthlete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(QuickAthlete, body);
    const m = await this.assertOperate(user, id);
    const instId = b.side === 'home' ? m.homeId : m.awayId;
    if (!instId) throw new BadRequestException('Este jogo não tem esse lado.');
    const athlete = await this.prisma.athlete.create({ data: { institutionId: instId, name: b.name, nickname: b.nickname ?? null, isSandbox: m.isSandbox } });
    await this.prisma.rosterEntry.create({ data: { athleteId: athlete.id, sportId: m.sportId, gender: m.gender, number: b.number ?? null, position: b.position ?? null } });
    await this.prisma.matchPlayer.create({ data: { matchId: id, athleteId: athlete.id, side: b.side, number: b.number ?? null, position: b.position ?? null, starter: b.starter } });
    await this.live.refresh(id);
    return { athlete, detail: await this.live.detailObj(id), engine: await this.live.engineState(id) };
  }

  @Put('matches/:id/participants')
  async participants(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const { participants } = parse(Participants, body);
    await this.assertOperate(user, id);
    await saveParticipants(this.prisma, id, participants);
    await this.live.refresh(id, true);
    return { detail: await this.live.detailObj(id), engine: await this.live.engineState(id) };
  }

  private async assertOperate(user: AuthUser, id: string) {
    const m = await this.live.raw(id);
    if (!this.live.canOperate(user, m)) throw new ForbiddenException('Sem permissão para editar este jogo.');
    return m;
  }

  private async roster(sportId: string, gender: string, instIds: (string | null)[]) {
    const ids = instIds.filter((x): x is string => !!x);
    const athletes = await this.prisma.athlete.findMany({
      where: { institutionId: { in: ids } },
      include: { rosters: { where: { sportId, gender } } },
      orderBy: { name: 'asc' },
    });
    const out: Record<string, { athleteId: string; name: string; nickname: string | null; number: number | null; position: string | null; inRoster: boolean }[]> = {};
    for (const a of athletes) {
      const r = a.rosters[0];
      (out[a.institutionId] ??= []).push({ athleteId: a.id, name: a.name, nickname: a.nickname, number: r?.number ?? null, position: r?.position ?? null, inRoster: !!r });
    }
    for (const k of Object.keys(out)) out[k].sort((x, y) => Number(y.inRoster) - Number(x.inRoster) || (x.number ?? 999) - (y.number ?? 999));
    return out;
  }
}

export async function saveParticipants(
  prisma: PrismaService,
  matchId: string,
  participants: { id?: string; institutionId: string; athleteName?: string | null; lane?: number | null }[],
) {
  const keep = participants.filter((p) => p.id).map((p) => p.id!);
  await prisma.$transaction([
    prisma.matchParticipant.deleteMany({ where: { matchId, id: { notIn: keep } } }),
    ...participants.map((p) =>
      p.id
        ? prisma.matchParticipant.update({ where: { id: p.id }, data: { institutionId: p.institutionId, athleteName: p.athleteName ?? null, lane: p.lane ?? null } })
        : prisma.matchParticipant.create({ data: { matchId, institutionId: p.institutionId, athleteName: p.athleteName ?? null, lane: p.lane ?? null } }),
    ),
  ]);
}
