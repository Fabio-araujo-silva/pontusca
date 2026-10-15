// CRUDs do painel: atléticas, modalidades, torneios, atletas/elencos e equipe
// (admins e mesários). Tudo restrito a ADMIN.
import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, AuthService, AuthUser, CurrentUser, Roles } from '../auth/auth';
import { toInstitution, toSport, toTournament } from '../common/mappers';
import { HEX, parse, uniqueSlug } from '../common/util';
import { LiveBus, LiveService } from '../live/live.service';
import { PrismaService } from '../prisma/prisma.service';
import { SPORTS_CATALOG } from '../shared/sports-catalog';

const opt = <T extends z.ZodTypeAny>(s: T) => s.nullish();

// ============================================================ atléticas

const InstitutionBody = z.object({
  name: z.string().trim().min(2, 'nome curto demais').max(40),
  fullName: opt(z.string().trim().max(120)),
  university: opt(z.string().trim().max(80)),
  city: opt(z.string().trim().max(60)),
  primaryColor: z.string().regex(HEX, 'cor no formato #RRGGBB'),
  secondaryColor: z.string().regex(HEX, 'cor no formato #RRGGBB'),
  accentColor: opt(z.string().regex(HEX)),
  flagPattern: z.enum(['stripes', 'diagonal', 'chevron', 'split', 'cross', 'solid']).default('stripes'),
  logo: opt(z.string().max(420_000, 'imagem grande demais (máx ~300KB)')),
});

@Controller('api/admin/institutions')
@UseGuards(AuthGuard)
@Roles('ADMIN')
export class InstitutionsController {
  constructor(
    private prisma: PrismaService,
    private bus: LiveBus,
  ) {}

  @Get()
  async list() {
    const rows = await this.prisma.institution.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { athletes: true, homeMatches: true, awayMatches: true } } } });
    return rows.map((r) => ({ ...toInstitution(r), athletes: r._count.athletes, matches: r._count.homeMatches + r._count.awayMatches }));
  }

  @Post()
  async create(@Body() body: unknown) {
    const b = parse(InstitutionBody, body);
    const slug = await uniqueSlug(b.name, async (s) => !!(await this.prisma.institution.findUnique({ where: { slug: s } })));
    const r = await this.prisma.institution.create({ data: { ...b, slug } });
    this.bus.emit('catalog');
    return toInstitution(r);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const b = parse(InstitutionBody.partial(), body);
    const r = await this.prisma.institution.update({ where: { id }, data: b });
    this.bus.emit('catalog');
    return toInstitution(r);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const used = await this.prisma.match.count({ where: { OR: [{ homeId: id }, { awayId: id }] } });
    if (used) throw new BadRequestException(`Atlética tem ${used} jogo(s). Remova os jogos antes.`);
    await this.prisma.institution.delete({ where: { id } });
    this.bus.emit('catalog');
    return { ok: true };
  }
}

// ============================================================ modalidades

const ActionSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/, 'chave só com a-z, 0-9 e _'),
  label: z.string().min(1).max(30),
  kind: z.enum(['score', 'card', 'sub', 'foul', 'timeout', 'stat']),
  value: z.number().min(0).max(100).optional(),
  against: z.boolean().optional(),
  both: z.boolean().optional(),
  color: z.enum(['yellow', 'red', 'blue', 'green', 'white']).optional(),
  athlete: z.enum(['required', 'optional', 'none']).optional(),
  celebrate: z.string().max(24).optional(),
  short: z.string().max(40).optional(),
  decisive: z.boolean().optional(),
});

const ConfigSchema = z
  .object({
    engine: z.enum(['SCORE', 'SETS', 'TENNIS', 'BASEBALL', 'RANKING']),
    allowDraw: z.boolean(),
    scoreLabel: z.string().max(20).optional(),
    periods: z
      .object({
        count: z.number().int().min(1).max(12),
        label: z.string().max(20),
        short: z.string().max(4),
        durationMin: z.number().min(0.5).max(240).nullable(),
        clock: z.enum(['up', 'down', 'none']),
        display: z.enum(['minute', 'mmss']),
        breakLabel: z.string().max(20),
      })
      .optional(),
    overtime: z.object({ count: z.number().int().min(1).max(6), durationMin: z.number().min(0.5).max(60).nullable(), label: z.string().max(24), short: z.string().max(4) }).nullish(),
    shootout: z.object({ label: z.string().max(24), kicks: z.number().int().min(1).max(10) }).nullish(),
    actions: z.array(ActionSchema).max(30),
    sets: z
      .object({
        bestOf: z.number().int().min(1).max(9),
        target: z.number().int().min(1).max(100).nullable(),
        decidingTarget: z.number().int().min(1).max(100).nullish(),
        winBy: z.number().int().min(1).max(5),
        cap: z.number().int().min(1).max(200).nullish(),
        label: z.string().max(16),
      })
      .optional(),
    tennis: z
      .object({
        bestOf: z.number().int().min(1).max(5),
        gamesPerSet: z.number().int().min(1).max(12),
        tiebreakAt: z.number().int().min(1).max(12),
        tiebreakTarget: z.number().int().min(1).max(20),
        superTiebreak: z.number().int().min(1).max(20).nullable(),
        noAd: z.boolean(),
      })
      .optional(),
    baseball: z.object({ innings: z.number().int().min(1).max(15) }).optional(),
    ranking: z.object({ order: z.enum(['asc', 'desc']), format: z.enum(['time', 'decimal', 'integer']), unit: z.string().max(6), resultLabel: z.string().max(16) }).optional(),
    lineup: z.object({ starters: z.number().int().min(0).max(30), positions: z.array(z.string().max(6)).max(20).optional() }).optional(),
  })
  .superRefine((c, ctx) => {
    const keys = c.actions.map((a) => a.key);
    if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', message: 'chaves de ação repetidas', path: ['actions'] });
    if (c.engine === 'SETS' && !c.sets) ctx.addIssue({ code: 'custom', message: 'configure os sets', path: ['sets'] });
    if (c.engine === 'TENNIS' && !c.tennis) ctx.addIssue({ code: 'custom', message: 'configure o tênis', path: ['tennis'] });
    if (c.engine === 'RANKING' && !c.ranking) ctx.addIssue({ code: 'custom', message: 'configure o ranking', path: ['ranking'] });
  });

const SportBody = z.object({
  name: z.string().trim().min(2).max(40),
  icon: z.string().max(30).default('generic'),
  category: z.enum(['team', 'individual', 'race']).default('team'),
  genders: z.array(z.enum(['M', 'F', 'X'])).min(1, 'escolha ao menos um naipe'),
  active: z.boolean().default(true),
  order: z.number().int().default(0),
  config: ConfigSchema,
});

@Controller('api/admin/sports')
@UseGuards(AuthGuard)
@Roles('ADMIN')
export class SportsController {
  constructor(
    private prisma: PrismaService,
    private bus: LiveBus,
    private live: LiveService,
  ) {}

  @Get()
  async list() {
    const rows = await this.prisma.sport.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }], include: { _count: { select: { matches: true } } } });
    return rows.map((r) => ({ ...toSport(r), matches: r._count.matches }));
  }

  @Get('catalog')
  catalog() {
    return SPORTS_CATALOG;
  }

  @Post()
  async create(@Body() body: unknown) {
    const b = parse(SportBody, body);
    const slug = await uniqueSlug(b.name, async (s) => !!(await this.prisma.sport.findUnique({ where: { slug: s } })));
    const r = await this.prisma.sport.create({
      data: { name: b.name, slug, icon: b.icon, category: b.category, genders: b.genders.join(','), active: b.active, order: b.order, engine: b.config.engine, config: JSON.stringify(b.config) },
    });
    this.bus.emit('catalog');
    return toSport(r);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const b = parse(SportBody.partial(), body);
    const cur = await this.prisma.sport.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException();
    if (b.config && b.config.engine !== cur.engine) {
      const n = await this.prisma.match.count({ where: { sportId: id, seq: { gt: 0 } } });
      if (n) throw new BadRequestException('Não dá pra trocar o motor de placar de uma modalidade que já tem jogos com lances.');
    }
    const r = await this.prisma.sport.update({
      where: { id },
      data: {
        ...(b.name && { name: b.name }),
        ...(b.icon && { icon: b.icon }),
        ...(b.category && { category: b.category }),
        ...(b.genders && { genders: b.genders.join(',') }),
        ...(b.active != null && { active: b.active }),
        ...(b.order != null && { order: b.order }),
        ...(b.config && { engine: b.config.engine, config: JSON.stringify(b.config) }),
      },
    });
    if (b.config) {
      const ms = await this.prisma.match.findMany({ where: { sportId: id }, select: { id: true } });
      for (const m of ms) await this.live.refresh(m.id);
    }
    this.bus.emit('catalog');
    return toSport(r);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const used = await this.prisma.match.count({ where: { sportId: id } });
    if (used) {
      await this.prisma.sport.update({ where: { id }, data: { active: false } });
      this.bus.emit('catalog');
      return { ok: true, deactivated: true, message: `Modalidade tem ${used} jogo(s): foi desativada em vez de apagada.` };
    }
    await this.prisma.sport.delete({ where: { id } });
    this.bus.emit('catalog');
    return { ok: true };
  }

  /** Recria as modalidades padrão que estiverem faltando (não mexe nas existentes). */
  @Post('restore-catalog')
  async restore() {
    let created = 0;
    for (const [i, s] of SPORTS_CATALOG.entries()) {
      const exists = await this.prisma.sport.findUnique({ where: { slug: s.slug } });
      if (exists) continue;
      await this.prisma.sport.create({ data: { name: s.name, slug: s.slug, icon: s.icon, category: s.category, genders: s.genders.join(','), engine: s.config.engine, config: JSON.stringify(s.config), order: i } });
      created++;
    }
    this.bus.emit('catalog');
    return { created };
  }
}

// ============================================================ torneios

const TournamentBody = z.object({
  name: z.string().trim().min(2).max(60),
  edition: opt(z.string().max(20)),
  city: opt(z.string().max(60)),
  startsAt: opt(z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))),
  endsAt: opt(z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))),
  active: z.boolean().default(true),
  tiebreakers: z.array(z.string()).max(10).optional(),
  color: opt(z.string().regex(HEX)),
  banner: opt(z.string().max(2_800_000, 'banner grande demais (máx ~2MB)')),
  bannerLink: opt(z.string().url('link inválido').max(500)),
});

const d = (s?: string | null) => (s ? new Date(s.length === 10 ? `${s}T12:00:00-03:00` : s) : null);

@Controller('api/admin/tournaments')
@UseGuards(AuthGuard)
@Roles('ADMIN')
export class TournamentsController {
  constructor(
    private prisma: PrismaService,
    private bus: LiveBus,
  ) {}

  @Get()
  async list(@Query('sandbox') sandbox?: string) {
    const rows = await this.prisma.tournament.findMany({
      where: sandbox === 'all' ? {} : { isSandbox: sandbox === '1' },
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { matches: true } } },
    });
    return rows.map((r) => ({ ...toTournament(r), matches: r._count.matches }));
  }

  @Post()
  async create(@Body() body: unknown) {
    const b = parse(TournamentBody, body);
    const slug = await uniqueSlug(`${b.name} ${b.edition ?? ''}`, async (s) => !!(await this.prisma.tournament.findUnique({ where: { slug: s } })));
    const t = await this.prisma.tournament.create({
      data: {
        name: b.name,
        slug,
        edition: b.edition ?? null,
        city: b.city ?? null,
        startsAt: d(b.startsAt),
        endsAt: d(b.endsAt),
        active: b.active,
        color: b.color ?? null,
        banner: b.banner ?? null,
        bannerLink: b.bannerLink ?? null,
        ...(b.tiebreakers && { tiebreakers: JSON.stringify(b.tiebreakers) }),
      },
    });
    // regra de pontuação padrão já nasce junto (o admin ajusta depois)
    await this.prisma.scoringRule.create({ data: { tournamentId: t.id, placementPoints: JSON.stringify([13, 10, 8, 6, 4, 2, 1]), racePoints: JSON.stringify([9, 7, 6, 5, 4, 3, 2, 1]) } });
    const hasCurrent = await this.prisma.tournament.count({ where: { isSandbox: false, isCurrent: true } });
    const saved = hasCurrent ? t : await this.prisma.tournament.update({ where: { id: t.id }, data: { isCurrent: true } });
    this.bus.emit('catalog');
    return toTournament(saved);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const b = parse(TournamentBody.partial(), body);
    const t = await this.prisma.tournament.update({
      where: { id },
      data: {
        ...(b.name && { name: b.name }),
        ...(b.edition !== undefined && { edition: b.edition }),
        ...(b.city !== undefined && { city: b.city }),
        ...(b.startsAt !== undefined && { startsAt: d(b.startsAt) }),
        ...(b.endsAt !== undefined && { endsAt: d(b.endsAt) }),
        ...(b.active != null && { active: b.active }),
        ...(b.color !== undefined && { color: b.color }),
        ...(b.banner !== undefined && { banner: b.banner }),
        ...(b.bannerLink !== undefined && { bannerLink: b.bannerLink }),
        ...(b.tiebreakers && { tiebreakers: JSON.stringify(b.tiebreakers) }),
      },
    });
    this.bus.emit('catalog');
    this.bus.emit('standings', id);
    return toTournament(t);
  }

  /** Define o "torneio do momento": é o único que o site público mostra. */
  @Post(':id/current')
  async setCurrent(@Param('id') id: string) {
    const t = await this.prisma.tournament.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Torneio não encontrado.');
    await this.prisma.$transaction([
      this.prisma.tournament.updateMany({ where: { isSandbox: t.isSandbox, NOT: { id } }, data: { isCurrent: false } }),
      this.prisma.tournament.update({ where: { id }, data: { isCurrent: true, active: true } }),
    ]);
    this.bus.emit('catalog');
    this.bus.emit('feed', { tournamentId: id, isSandbox: t.isSandbox });
    return { ok: true };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const n = await this.prisma.match.count({ where: { tournamentId: id, seq: { gt: 0 } } });
    if (n) throw new BadRequestException(`Torneio tem ${n} jogo(s) com lances registrados. Desative-o em vez de apagar.`);
    await this.prisma.tournament.delete({ where: { id } });
    this.bus.emit('catalog');
    return { ok: true };
  }
}

// ============================================================ atletas e elencos

const AthleteBody = z.object({
  institutionId: z.string(),
  name: z.string().trim().min(2).max(80),
  nickname: opt(z.string().trim().max(40)),
  course: opt(z.string().trim().max(60)),
});

const RosterBody = z.object({
  institutionId: z.string(),
  sportId: z.string(),
  gender: z.enum(['M', 'F', 'X']),
  entries: z.array(z.object({ athleteId: z.string(), number: z.number().int().min(0).max(999).nullish(), position: opt(z.string().max(12)) })).max(80),
});

const BulkBody = z.object({
  institutionId: z.string(),
  sportId: z.string(),
  gender: z.enum(['M', 'F', 'X']),
  text: z.string().max(20_000),
});

@Controller('api/admin')
@UseGuards(AuthGuard)
@Roles('ADMIN')
export class AthletesController {
  constructor(private prisma: PrismaService) {}

  @Get('athletes')
  async list(@Query('institutionId') institutionId?: string, @Query('q') q?: string) {
    return this.prisma.athlete.findMany({
      where: { ...(institutionId && { institutionId }), ...(q && { name: { contains: q } }) },
      include: { rosters: { include: { sport: { select: { name: true } } } } },
      orderBy: { name: 'asc' },
      take: 500,
    });
  }

  @Post('athletes')
  create(@Body() body: unknown) {
    return this.prisma.athlete.create({ data: parse(AthleteBody, body) });
  }

  @Patch('athletes/:id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.prisma.athlete.update({ where: { id }, data: parse(AthleteBody.partial(), body) });
  }

  @Delete('athletes/:id')
  async remove(@Param('id') id: string) {
    await this.prisma.athlete.delete({ where: { id } });
    return { ok: true };
  }

  @Get('rosters')
  async roster(@Query('institutionId') institutionId: string, @Query('sportId') sportId: string, @Query('gender') gender: string) {
    return this.prisma.rosterEntry.findMany({
      where: { sportId, gender, athlete: { institutionId } },
      include: { athlete: true },
      orderBy: [{ number: 'asc' }],
    });
  }

  @Put('rosters')
  async saveRoster(@Body() body: unknown) {
    const b = parse(RosterBody, body);
    await this.prisma.$transaction([
      this.prisma.rosterEntry.deleteMany({ where: { sportId: b.sportId, gender: b.gender, athlete: { institutionId: b.institutionId } } }),
      ...b.entries.map((e) => this.prisma.rosterEntry.create({ data: { athleteId: e.athleteId, sportId: b.sportId, gender: b.gender, number: e.number ?? null, position: e.position ?? null } })),
    ]);
    return this.roster(b.institutionId, b.sportId, b.gender);
  }

  /**
   * Cola de elenco: uma linha por atleta, ex.:
   *   10 João Silva - ATA
   *   1 Pedro "Paredão" Lima - GOL
   *   Maria Souza
   */
  @Post('rosters/bulk')
  async bulk(@Body() body: unknown) {
    const b = parse(BulkBody, body);
    let created = 0;
    for (const raw of b.text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const m = line.match(/^(\d{1,3})?\s*[-.)]?\s*(.+?)(?:\s+-\s+([A-Za-zÀ-ú0-9]{1,6}))?$/);
      if (!m) continue;
      const number = m[1] ? Number(m[1]) : null;
      let name = m[2].trim();
      const nick = name.match(/"([^"]+)"/)?.[1] ?? null;
      name = name.replace(/"[^"]+"/, '').replace(/\s+/g, ' ').trim();
      if (name.length < 2) continue;
      let a = await this.prisma.athlete.findFirst({ where: { institutionId: b.institutionId, name } });
      if (!a) a = await this.prisma.athlete.create({ data: { institutionId: b.institutionId, name, nickname: nick } });
      await this.prisma.rosterEntry.upsert({
        where: { athleteId_sportId_gender: { athleteId: a.id, sportId: b.sportId, gender: b.gender } },
        create: { athleteId: a.id, sportId: b.sportId, gender: b.gender, number, position: m[3]?.toUpperCase() ?? null },
        update: { number, position: m[3]?.toUpperCase() ?? null },
      });
      created++;
    }
    return { created, roster: await this.roster(b.institutionId, b.sportId, b.gender) };
  }
}

// ============================================================ equipe (admins e mesários)

const UserBody = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email('e-mail inválido').transform((s) => s.toLowerCase().trim()),
  password: z.string().min(6, 'senha com pelo menos 6 caracteres').max(100).optional(),
  role: z.enum(['ADMIN', 'MESARIO']),
  phone: opt(z.string().max(30)),
  active: z.boolean().default(true),
  sportIds: z.array(z.string()).default([]),
});

@Controller('api/admin/users')
@UseGuards(AuthGuard)
@Roles('ADMIN')
export class UsersController {
  constructor(
    private prisma: PrismaService,
    private auth: AuthService,
  ) {}

  @Get()
  async list() {
    const rows = await this.prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      include: { sports: true, _count: { select: { primaryOf: true, backupOf: true } } },
    });
    return rows.map(({ passwordHash, sports, _count, ...u }) => ({ ...u, sportIds: sports.map((s) => s.sportId), matches: _count.primaryOf, backupMatches: _count.backupOf }));
  }

  @Post()
  async create(@Body() body: unknown) {
    const b = parse(UserBody, body);
    if (!b.password) throw new BadRequestException('Defina uma senha inicial.');
    if (await this.prisma.user.findUnique({ where: { email: b.email } })) throw new BadRequestException('Já existe alguém com esse e-mail.');
    const u = await this.prisma.user.create({
      data: { name: b.name, email: b.email, role: b.role, phone: b.phone ?? null, active: b.active, passwordHash: await this.auth.hash(b.password), sports: { create: b.sportIds.map((sportId) => ({ sportId })) } },
    });
    return { id: u.id };
  }

  @Patch(':id')
  async update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(UserBody.partial(), body);
    const cur = await this.prisma.user.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException();
    if (cur.role === 'ADMIN' && (b.role === 'MESARIO' || b.active === false)) await this.assertNotLastAdmin(id);
    if (id === me.id && b.active === false) throw new BadRequestException('Você não pode se desativar.');
    await this.prisma.user.update({
      where: { id },
      data: {
        ...(b.name && { name: b.name }),
        ...(b.email && { email: b.email }),
        ...(b.role && { role: b.role }),
        ...(b.phone !== undefined && { phone: b.phone }),
        ...(b.active != null && { active: b.active }),
        ...(b.password && { passwordHash: await this.auth.hash(b.password) }),
      },
    });
    if (b.sportIds) {
      await this.prisma.userSport.deleteMany({ where: { userId: id } });
      if (b.sportIds.length) await this.prisma.userSport.createMany({ data: b.sportIds.map((sportId) => ({ userId: id, sportId })) });
    }
    this.auth.forget(id);
    return { ok: true };
  }

  @Delete(':id')
  async remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    if (id === me.id) throw new BadRequestException('Você não pode apagar a si mesmo.');
    const cur = await this.prisma.user.findUnique({ where: { id } });
    if (cur?.role === 'ADMIN') await this.assertNotLastAdmin(id);
    await this.prisma.user.delete({ where: { id } });
    this.auth.forget(id);
    return { ok: true };
  }

  private async assertNotLastAdmin(id: string) {
    const n = await this.prisma.user.count({ where: { role: 'ADMIN', active: true, NOT: { id } } });
    if (!n) throw new BadRequestException('Precisa sobrar pelo menos um admin ativo.');
  }
}

