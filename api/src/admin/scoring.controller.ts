import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, AuthUser, CurrentUser, Roles } from '../auth/auth';
import { json, parse } from '../common/util';
import { LiveBus } from '../live/live.service';
import { PrismaService } from '../prisma/prisma.service';
import { StandingsService } from '../standings/standings.service';

const RuleBody = z.object({
  tournamentId: z.string(),
  sportId: z.string().nullish(),
  gender: z.enum(['M', 'F', 'X']).nullish(),
  win: z.number().min(-100).max(1000),
  draw: z.number().min(-100).max(1000),
  loss: z.number().min(-100).max(1000),
  woWin: z.number().min(-100).max(1000),
  woLoss: z.number().min(-100).max(1000),
  participation: z.number().min(-100).max(1000).default(0),
  placementPoints: z.array(z.number().min(-100).max(1000)).max(32).default([]),
  racePoints: z.array(z.number().min(-100).max(1000)).max(32).default([]),
  tiebreakers: z.array(z.string()).max(8).default(['POINTS', 'WINS', 'SCORE_DIFF', 'SCORE_FOR', 'HEAD_TO_HEAD']),
});

const PlacementBody = z.object({
  tournamentId: z.string(),
  sportId: z.string(),
  gender: z.enum(['M', 'F', 'X']),
  items: z.array(z.object({ institutionId: z.string(), position: z.number().int().min(1).max(64) })).max(64),
});

const AdjustmentBody = z.object({
  tournamentId: z.string(),
  institutionId: z.string(),
  points: z.number().min(-10000).max(10000),
  reason: z.string().trim().min(2, 'explique o motivo').max(200),
});

/** Pontuação do torneio: regras por modalidade, classificação final e ajustes manuais. */
@Controller('api/admin/scoring')
@UseGuards(AuthGuard)
@Roles('ADMIN')
export class ScoringController {
  constructor(
    private prisma: PrismaService,
    private bus: LiveBus,
    private standings: StandingsService,
  ) {}

  @Get()
  async get(@Query('tournamentId') tournamentId: string) {
    const [rules, placements, adjustments] = await Promise.all([
      this.prisma.scoringRule.findMany({ where: { tournamentId } }),
      this.prisma.placement.findMany({ where: { tournamentId }, orderBy: { position: 'asc' } }),
      this.prisma.pointAdjustment.findMany({ where: { tournamentId }, orderBy: { createdAt: 'desc' } }),
    ]);
    return {
      rules: rules.map((r) => ({ ...r, placementPoints: json(r.placementPoints, []), racePoints: json(r.racePoints, []), tiebreakers: json(r.tiebreakers, []) })),
      placements,
      adjustments,
      standings: await this.standings.compute(tournamentId),
    };
  }

  @Put('rules')
  async saveRule(@Body() body: unknown) {
    const b = parse(RuleBody, body);
    const data = {
      win: b.win,
      draw: b.draw,
      loss: b.loss,
      woWin: b.woWin,
      woLoss: b.woLoss,
      participation: b.participation,
      placementPoints: JSON.stringify(b.placementPoints),
      racePoints: JSON.stringify(b.racePoints),
      tiebreakers: JSON.stringify(b.tiebreakers),
    };
    const existing = await this.prisma.scoringRule.findFirst({ where: { tournamentId: b.tournamentId, sportId: b.sportId ?? null, gender: b.gender ?? null } });
    const r = existing
      ? await this.prisma.scoringRule.update({ where: { id: existing.id }, data })
      : await this.prisma.scoringRule.create({ data: { ...data, tournamentId: b.tournamentId, sportId: b.sportId ?? null, gender: b.gender ?? null } });
    this.bus.emit('standings', b.tournamentId);
    return r;
  }

  @Delete('rules/:id')
  async removeRule(@Param('id') id: string) {
    const r = await this.prisma.scoringRule.delete({ where: { id } });
    this.bus.emit('standings', r.tournamentId);
    return { ok: true };
  }

  @Put('placements')
  async savePlacements(@Body() body: unknown) {
    const b = parse(PlacementBody, body);
    await this.prisma.$transaction([
      this.prisma.placement.deleteMany({ where: { tournamentId: b.tournamentId, sportId: b.sportId, gender: b.gender } }),
      this.prisma.placement.createMany({ data: b.items.map((i) => ({ ...i, tournamentId: b.tournamentId, sportId: b.sportId, gender: b.gender })) }),
    ]);
    this.bus.emit('standings', b.tournamentId);
    return { ok: true };
  }

  @Post('adjustments')
  async addAdjustment(@CurrentUser() me: AuthUser, @Body() body: unknown) {
    const b = parse(AdjustmentBody, body);
    const a = await this.prisma.pointAdjustment.create({ data: { ...b, createdById: me.id } });
    this.bus.emit('standings', b.tournamentId);
    return a;
  }

  @Delete('adjustments/:id')
  async removeAdjustment(@Param('id') id: string) {
    const a = await this.prisma.pointAdjustment.delete({ where: { id } });
    this.bus.emit('standings', a.tournamentId);
    return { ok: true };
  }
}
