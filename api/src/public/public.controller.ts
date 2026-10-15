import { Controller, Get, Header, Injectable, NotFoundException, Param, Query, Req, Res } from '@nestjs/common';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { toInstitution, toSport, toTournament } from '../common/mappers';
import { Coalescer, Payload, sendPayload } from '../common/payload';
import { LiveBus, LiveService } from '../live/live.service';
import { PrismaService } from '../prisma/prisma.service';
import type { InstitutionDTO, MatchSummary, TournamentDTO } from '../shared/types';
import { StandingsService } from '../standings/standings.service';

const short = (s: string) => createHash('sha1').update(s).digest('base64url').slice(0, 10);
const isDataUrl = (s?: string | null): s is string => !!s && s.startsWith('data:');

/**
 * Imagens enviadas no admin ficam no banco como data URL. No público viram um
 * link próprio, versionado e cacheável pra sempre: o bootstrap fica leve e o
 * navegador baixa cada logo uma vez só.
 */
const publicInstitution = (i: InstitutionDTO): InstitutionDTO => (isDataUrl(i.logo) ? { ...i, logo: `/api/public/media/institution/${i.id}?v=${short(i.logo)}` } : i);
const publicTournament = (t: TournamentDTO): TournamentDTO => (isDataUrl(t.banner) ? { ...t, banner: `/api/public/media/tournament/${t.id}?v=${short(t.banner)}` } : t);

/**
 * Feed público em memória. Cada torneio guarda o mapa de resumos dos jogos e
 * a resposta pronta (texto + gzip); um placar novo só remenda a entrada daquele jogo.
 * Milhares de torcedores dando refresh = zero consulta ao banco.
 */
@Injectable()
export class FeedService {
  private feeds = new Map<string, { matches: Map<string, MatchSummary>; payload?: Payload }>();
  private boot = new Map<string, { payload: Payload; at: number }>();
  // versão por torneio: uma montagem que começou antes de uma edição não é guardada
  private gen = new Map<string, number>();
  private bootGen = 0;
  private building = new Coalescer<Map<string, MatchSummary>>();
  private bootBuilding = new Coalescer<Payload>();

  constructor(
    private prisma: PrismaService,
    private live: LiveService,
    bus: LiveBus,
  ) {
    bus.on('summary', (s: MatchSummary) => {
      const f = this.feeds.get(s.tournamentId);
      if (!f) return;
      f.matches.set(s.id, s);
      f.payload = undefined;
    });
    bus.on('feed', (p: { tournamentId: string }) => {
      this.feeds.delete(p.tournamentId);
      this.gen.set(p.tournamentId, (this.gen.get(p.tournamentId) ?? 0) + 1);
    });
    bus.on('catalog', () => {
      this.boot.clear();
      this.bootGen++;
    });
  }

  async feed(tournamentId: string) {
    let f = this.feeds.get(tournamentId);
    if (!f) {
      const gen = this.gen.get(tournamentId) ?? 0;
      const matches = await this.building.run(`${tournamentId}:${gen}`, async () => {
        const rows = await this.prisma.match.findMany({ where: { tournamentId }, select: { id: true }, orderBy: { scheduledAt: 'asc' } });
        const map = new Map<string, MatchSummary>();
        for (const s of await Promise.all(rows.map((r) => this.live.summary(r.id)))) map.set(s.id, s);
        return map;
      });
      f = this.feeds.get(tournamentId);
      if (!f) {
        f = { matches: new Map(matches) };
        if ((this.gen.get(tournamentId) ?? 0) === gen) this.feeds.set(tournamentId, f);
      }
    }
    return (f.payload ??= new Payload(JSON.stringify([...f.matches.values()].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)))));
  }

  async bootstrap(sandbox: boolean) {
    const key = sandbox ? 'sb' : 'pub';
    const hit = this.boot.get(key);
    if (hit && Date.now() - hit.at < 30_000) return hit.payload;
    const gen = this.bootGen;
    const payload = await this.bootBuilding.run(`${key}:${gen}`, async () => {
      const [tournaments, institutions, sports] = await Promise.all([
        // só o torneio do momento (definido no admin); sem ele, o mais recente ativo
        this.prisma.tournament.findMany({ where: { isSandbox: sandbox, active: true }, orderBy: [{ isCurrent: 'desc' }, { startsAt: 'desc' }, { createdAt: 'desc' }], take: 1 }),
        this.prisma.institution.findMany({ where: sandbox ? {} : { isSandbox: false }, orderBy: { name: 'asc' } }),
        this.prisma.sport.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }] }),
      ]);
      return new Payload(
        JSON.stringify({
          tournaments: tournaments.map(toTournament).map(publicTournament),
          institutions: institutions.map(toInstitution).map(publicInstitution),
          sports: sports.map(toSport),
          sandbox,
        }),
      );
    });
    if (gen === this.bootGen) this.boot.set(key, { payload, at: Date.now() });
    return payload;
  }

  /** Imagem decodificada do data URL, guardada por versão. */
  private media = new Map<string, { type: string; body: Buffer }>();
  async image(kind: 'institution' | 'tournament', id: string, v: string) {
    const key = `${kind}:${id}:${v}`;
    const hit = this.media.get(key);
    if (hit) return hit;
    const raw =
      kind === 'institution'
        ? (await this.prisma.institution.findUnique({ where: { id }, select: { logo: true } }))?.logo
        : (await this.prisma.tournament.findUnique({ where: { id }, select: { banner: true } }))?.banner;
    const m = raw && /^data:([\w/+.-]+);base64,(.*)$/s.exec(raw);
    if (!m) throw new NotFoundException();
    const img = { type: m[1], body: Buffer.from(m[2], 'base64') };
    if (this.media.size > 300) this.media.clear();
    this.media.set(key, img);
    return img;
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
  async bootstrap(@Query('sandbox') sandbox: string, @Req() req: Request, @Res() res: Response) {
    sendPayload(req, res, await this.feed.bootstrap(sandbox === '1'), 5);
  }

  @Get('time')
  @Header('Cache-Control', 'no-store')
  time() {
    return { serverTime: Date.now() };
  }

  @Get('tournaments/:id/feed')
  async tournamentFeed(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    sendPayload(req, res, await this.feed.feed(id), 1);
  }

  @Get('tournaments/:id/standings')
  async tournamentStandings(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    sendPayload(req, res, await this.standings.payload(id), 5);
  }

  /** Lance a lance. Sai da memória (sem banco); 404 vem do próprio cache ao vivo. */
  @Get('matches/:id')
  async match(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    sendPayload(req, res, await this.live.detailPayload(id), 1);
  }

  @Get('media/:kind/:id')
  async mediaFile(@Param('kind') kind: string, @Param('id') id: string, @Query('v') v: string, @Res() res: Response) {
    if (kind !== 'institution' && kind !== 'tournament') throw new NotFoundException();
    const img = await this.feed.image(kind, id, v ?? '');
    res.setHeader('Content-Type', img.type);
    // a URL muda quando a imagem muda (?v=hash): pode guardar pra sempre
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(img.body);
  }

  @Get('institutions/:slug')
  async institution(@Param('slug') slug: string) {
    const i = await this.prisma.institution.findUnique({ where: { slug } });
    if (!i) throw new NotFoundException('Atlética não encontrada.');
    return publicInstitution(toInstitution(i));
  }

  /** Torneios encerrados também (histórico). */
  @Get('tournaments')
  async tournaments(@Query('sandbox') sandbox: string) {
    const ts = await this.prisma.tournament.findMany({ where: { isSandbox: sandbox === '1' }, orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }] });
    return ts.map(toTournament).map(publicTournament);
  }
}
