import { Controller, Get, Header, Injectable, NotFoundException, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { toInstitution, toSport, toTournament } from '../common/mappers';
import { LiveBus, LiveService } from '../live/live.service';
import { PrismaService } from '../prisma/prisma.service';
import type { MatchSummary } from '../shared/types';
import { StandingsService } from '../standings/standings.service';

/**
 * Feed público em memória. Cada torneio guarda o mapa de resumos dos jogos e
 * o JSON serializado; um placar novo só remenda a entrada daquele jogo.
 * Milhares de torcedores dando refresh = zero consulta ao banco.
 */
@Injectable()
export class FeedService {
  private feeds = new Map<string, { matches: Map<string, MatchSummary>; json?: string }>();
  private boot = new Map<string, { json: string; at: number }>();

  constructor(
    private prisma: PrismaService,
    private live: LiveService,
    bus: LiveBus,
  ) {
    bus.on('summary', (s: MatchSummary) => {
      const f = this.feeds.get(s.tournamentId);
      if (!f) return;
      f.matches.set(s.id, s);
      f.json = undefined;
    });
    bus.on('feed', (p: { tournamentId: string }) => {
      this.feeds.delete(p.tournamentId);
      this.boot.clear();
    });
    bus.on('catalog', () => this.boot.clear());
  }

  async feed(tournamentId: string) {
    let f = this.feeds.get(tournamentId);
    if (!f) {
      const rows = await this.prisma.match.findMany({ where: { tournamentId }, select: { id: true }, orderBy: { scheduledAt: 'asc' } });
      const matches = new Map<string, MatchSummary>();
      for (const r of rows) matches.set(r.id, await this.live.summary(r.id));
      f = { matches };
      this.feeds.set(tournamentId, f);
    }
    if (!f.json) f.json = JSON.stringify([...f.matches.values()].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
    return f.json;
  }

  async bootstrap(sandbox: boolean) {
    const key = sandbox ? 'sb' : 'pub';
    const hit = this.boot.get(key);
    if (hit && Date.now() - hit.at < 10_000) return hit.json;
    const [tournaments, institutions, sports] = await Promise.all([
      // só o torneio do momento (definido no admin); sem ele, o mais recente ativo
      this.prisma.tournament.findMany({ where: { isSandbox: sandbox, active: true }, orderBy: [{ isCurrent: 'desc' }, { startsAt: 'desc' }, { createdAt: 'desc' }], take: 1 }),
      this.prisma.institution.findMany({ where: sandbox ? {} : { isSandbox: false }, orderBy: { name: 'asc' } }),
      this.prisma.sport.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }] }),
    ]);
    const out = JSON.stringify({
      tournaments: tournaments.map(toTournament),
      institutions: institutions.map(toInstitution),
      sports: sports.map(toSport),
      sandbox,
    });
    this.boot.set(key, { json: out, at: Date.now() });
    return out;
  }
}

@Controller('api/public')
export class PublicController {
  constructor(
    private feed: FeedService,
    private live: LiveService,
    private standings: StandingsService,
    private prisma: PrismaService,
  ) {}

  @Get('bootstrap')
  async bootstrap(@Query('sandbox') sandbox: string, @Res() res: Response) {
    send(res, await this.feed.bootstrap(sandbox === '1'), 5);
  }

  @Get('time')
  @Header('Cache-Control', 'no-store')
  time() {
    return { serverTime: Date.now() };
  }

  @Get('tournaments/:id/feed')
  async tournamentFeed(@Param('id') id: string, @Res() res: Response) {
    send(res, await this.feed.feed(id), 1);
  }

  @Get('tournaments/:id/standings')
  async tournamentStandings(@Param('id') id: string, @Res() res: Response) {
    send(res, await this.standings.json(id), 5);
  }

  @Get('matches/:id')
  async match(@Param('id') id: string, @Res() res: Response) {
    const m = await this.prisma.match.findUnique({ where: { id }, select: { id: true } });
    if (!m) throw new NotFoundException('Jogo não encontrado.');
    send(res, await this.live.detailJson(id), 1);
  }

  @Get('institutions/:slug')
  async institution(@Param('slug') slug: string) {
    const i = await this.prisma.institution.findUnique({ where: { slug } });
    if (!i) throw new NotFoundException('Atlética não encontrada.');
    return toInstitution(i);
  }

  /** Torneios encerrados também (histórico). */
  @Get('tournaments')
  async tournaments(@Query('sandbox') sandbox: string) {
    const ts = await this.prisma.tournament.findMany({ where: { isSandbox: sandbox === '1' }, orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }] });
    return ts.map(toTournament);
  }
}

function send(res: Response, body: string, maxAge: number) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
  res.send(body);
}

