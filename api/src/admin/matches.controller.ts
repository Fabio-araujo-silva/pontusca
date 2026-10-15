import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, AuthUser, CurrentUser, Roles } from '../auth/auth';
import { log } from '../common/log';
import { json, parse } from '../common/util';
import { LiveGateway } from '../live/live.gateway';
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

// undefined = não mexe; null = tira a pessoa
const StaffBody = z.object({ mesarioId: z.string().nullish(), backupMesarioId: z.string().nullish() });
const BulkStaffBody = z.object({ matchIds: z.array(z.string()).min(1).max(300), role: z.enum(['mesario', 'backup']), userId: z.string().nullable() });

const STAFF_CONFLICT_MS = 90 * 60_000; // jogos a menos disso um do outro = mesma pessoa em dois lugares
const hm = (d: Date) => d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

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
      include: { mesario: { select: { id: true, name: true, phone: true } }, backupMesario: { select: { id: true, name: true, phone: true } } },
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
    // mesário só é revalidado se a escala mudou (antes, editar só o local falhava
    // se o mesário escalado tinha perdido a modalidade ou sido desativado)
    const staffChanged = (b.mesarioId !== undefined && b.mesarioId !== cur.mesarioId) || (b.backupMesarioId !== undefined && b.backupMesarioId !== cur.backupMesarioId);
    await this.validate(merged, b.participants, staffChanged);
    const teamsChanged = (b.homeId !== undefined && b.homeId !== cur.homeId) || (b.awayId !== undefined && b.awayId !== cur.awayId);
    const sportChanged = (b.sportId !== undefined && b.sportId !== cur.sportId) || (b.gender !== undefined && b.gender !== cur.gender);
    if ((teamsChanged || sportChanged) && cur.seq > 0)
      throw new BadRequestException(`Jogo já tem lances: não dá pra trocar ${teamsChanged ? 'as equipes' : 'a modalidade/naipe'}. Zere o jogo antes.`);
    const { participants, ...data } = b;
    // mudou de torneio: segue o ambiente dele (sandbox x real)
    const isSandbox = b.tournamentId && b.tournamentId !== cur.tournamentId ? (await this.prisma.tournament.findUnique({ where: { id: b.tournamentId } }))!.isSandbox : undefined;
    await this.live.mutate(
      id,
      async () => {
        await this.prisma.match.update({
          where: { id },
          data: {
            ...data,
            ...(b.scheduledAt && { scheduledAt: new Date(b.scheduledAt) }),
            ...(isSandbox !== undefined && { isSandbox }),
            ...(b.backupMesarioId !== undefined && b.backupMesarioId !== cur.backupMesarioId && { backupEnabled: false }),
          },
        });
        if (participants) await saveParticipants(this.prisma, id, participants);
        if (teamsChanged || sportChanged) {
          await this.prisma.matchPlayer.deleteMany({ where: { matchId: id } });
          await this.importLineups(id);
        }
      },
      true,
    );
    // o feed do torneio antigo também muda
    if (b.tournamentId && b.tournamentId !== cur.tournamentId) this.bus.emit('feed', { tournamentId: cur.tournamentId, isSandbox: cur.isSandbox });
    this.bus.emit('staff', id);
    return this.live.summary(id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    // na fila do jogo: não apaga no meio de um lance chegando
    const m = await this.live.mutate(id, () => this.prisma.match.delete({ where: { id } }));
    this.live.forget(id, m.tournamentId, m.isSandbox);
    log.info('match.deleted', { match: id, tournament: m.tournamentId, seq: m.seq });
    return { ok: true };
  }

  /** Escala rápida de um jogo: titular e/ou reserva. */
  @Patch(':id/staff')
  async staff(@Param('id') id: string, @Body() body: unknown) {
    const b = parse(StaffBody, body);
    return this.assignStaff([id], (m) => ({
      mesarioId: b.mesarioId === undefined ? m.mesarioId : b.mesarioId,
      backupMesarioId: b.backupMesarioId === undefined ? m.backupMesarioId : b.backupMesarioId,
    }));
  }

  /** Escala em lote: põe (ou tira) uma pessoa como titular/reserva de vários jogos. */
  @Post('staff/bulk')
  async staffBulk(@Body() body: unknown) {
    const b = parse(BulkStaffBody, body);
    return this.assignStaff(b.matchIds, (m) =>
      b.role === 'mesario'
        ? // virou titular de um jogo em que era reserva: sai da reserva
          { mesarioId: b.userId, backupMesarioId: b.userId && m.backupMesarioId === b.userId ? null : m.backupMesarioId }
        : { backupMesarioId: b.userId, mesarioId: b.userId && m.mesarioId === b.userId ? null : m.mesarioId },
    );
  }

  /**
   * Aplica a escala com validação completa (pessoa ativa, habilitada na modalidade,
   * titular ≠ reserva). Tudo ou nada. Devolve avisos de choque de horário.
   */
  private async assignStaff(ids: string[], next: (m: { mesarioId: string | null; backupMesarioId: string | null }) => { mesarioId: string | null; backupMesarioId: string | null }) {
    const matches = await this.prisma.match.findMany({
      where: { id: { in: ids } },
      include: { sport: { select: { name: true } }, home: { select: { name: true } }, away: { select: { name: true } } },
    });
    if (matches.length !== new Set(ids).size) throw new NotFoundException('Algum jogo não foi encontrado (apagado?). Recarregue a lista.');
    const label = (m: (typeof matches)[number]) => `${m.sport.name}${m.title ? ` · ${m.title}` : m.home && m.away ? ` ${m.home.name} × ${m.away.name}` : ''} (${hm(m.scheduledAt)})`;

    const plan = matches.map((m) => ({ m, n: next(m) }));
    const userIds = [...new Set(plan.flatMap(({ n }) => [n.mesarioId, n.backupMesarioId]).filter((x): x is string => !!x))];
    const users = new Map((await this.prisma.user.findMany({ where: { id: { in: userIds } }, include: { sports: true } })).map((u) => [u.id, u]));

    const errors: string[] = [];
    for (const { m, n } of plan) {
      if (n.mesarioId && n.mesarioId === n.backupMesarioId) errors.push(`${label(m)}: titular e reserva precisam ser pessoas diferentes.`);
      // só valida quem está ENTRANDO (o titular antigo desativado não pode travar a troca do reserva)
      for (const uid of [n.mesarioId !== m.mesarioId && n.mesarioId, n.backupMesarioId !== m.backupMesarioId && n.backupMesarioId]) {
        if (!uid) continue;
        const u = users.get(uid);
        if (!u || !u.active) errors.push(`${label(m)}: pessoa não encontrada ou desativada.`);
        else if (u.role === 'MESARIO' && !u.sports.some((s) => s.sportId === m.sportId)) errors.push(`${u.name} não está habilitado(a) para ${m.sport.name} (ver Equipe).`);
      }
    }
    if (errors.length) {
      log.warn('staff.rejected', { matches: ids, errors });
      throw new BadRequestException(errors.length > 1 ? `${errors[0]} (+${errors.length - 1} problema${errors.length > 2 ? 's' : ''})` : errors[0]);
    }

    const changed = plan.filter(({ m, n }) => m.mesarioId !== n.mesarioId || m.backupMesarioId !== n.backupMesarioId);
    await this.prisma.$transaction(
      changed.map(({ m, n }) =>
        this.prisma.match.update({
          where: { id: m.id },
          // trocou o reserva: a liberação dada ao anterior não vale pro novo
          data: { mesarioId: n.mesarioId, backupMesarioId: n.backupMesarioId, ...(n.backupMesarioId !== m.backupMesarioId && { backupEnabled: false }) },
        }),
      ),
    );
    // permissões do console leem o cache ao vivo: recarrega os jogos que mudaram
    await Promise.all(changed.map(({ m }) => this.live.refresh(m.id)));
    for (const { m, n } of changed) {
      log.info('staff.assign', {
        match: m.id,
        jogo: label(m),
        titular: [m.mesarioId, n.mesarioId].map((x) => (x ? (users.get(x)?.name ?? x) : '—')).join(' → '),
        reserva: [m.backupMesarioId, n.backupMesarioId].map((x) => (x ? (users.get(x)?.name ?? x) : '—')).join(' → '),
      });
      this.bus.emit('staff', m.id);
    }

    // choque de horário: a mesma pessoa em outro jogo perto desse
    const warnings: string[] = [];
    for (const uid of userIds) {
      // só quem acabou de entrar no jogo (o titular que já estava não gera aviso)
      const mine = changed
        .filter(({ m, n }) => (n.mesarioId === uid && m.mesarioId !== uid) || (n.backupMesarioId === uid && m.backupMesarioId !== uid))
        .map(({ m }) => m);
      if (!mine.length) continue;
      const others = await this.prisma.match.findMany({
        where: {
          OR: [{ mesarioId: uid }, { backupMesarioId: uid }],
          status: { in: ['SCHEDULED', 'LIVE'] },
          scheduledAt: { gte: new Date(Math.min(...mine.map((m) => +m.scheduledAt)) - STAFF_CONFLICT_MS), lte: new Date(Math.max(...mine.map((m) => +m.scheduledAt)) + STAFF_CONFLICT_MS) },
        },
        include: { sport: { select: { name: true } }, home: { select: { name: true } }, away: { select: { name: true } } },
        orderBy: { scheduledAt: 'asc' },
      });
      for (const m of mine)
        for (const o of others)
          if (o.id !== m.id && Math.abs(+o.scheduledAt - +m.scheduledAt) < STAFF_CONFLICT_MS)
            warnings.push(`${users.get(uid)!.name} também está em ${label(o)}.`);
    }
    return { updated: changed.length, warnings: [...new Set(warnings)].slice(0, 6) };
  }

  /** Libera (ou bloqueia) o mesário reserva de registrar AGORA. */
  @Post(':id/backup')
  async backup(@Param('id') id: string, @Body() body: unknown) {
    const { enabled } = parse(z.object({ enabled: z.boolean() }), body);
    const m = await this.prisma.match.update({ where: { id }, data: { backupEnabled: enabled }, include: { backupMesario: { select: { name: true } } } });
    await this.live.refresh(id);
    this.bus.emit('staff', id);
    log.info(enabled ? 'staff.backup_enabled' : 'staff.backup_blocked', { match: id, reserva: m.backupMesario?.name });
    return { ok: true, backupEnabled: enabled };
  }

  /** Resultado manual (jogo passado sem súmula, correção, W.O. combinado...). */
  @Put(':id/result')
  async setResult(@Param('id') id: string, @Body() body: unknown) {
    const r = parse(ResultBody, body);
    await this.live.mutate(id, () => this.prisma.match.update({ where: { id }, data: { manualResult: JSON.stringify(r), status: 'FINISHED' } }));
    this.bus.emit('standings', (await this.live.raw(id)).tournamentId);
    return this.live.summary(id);
  }

  @Delete(':id/result')
  async clearResult(@Param('id') id: string) {
    await this.live.mutate(id, () => this.prisma.match.update({ where: { id }, data: { manualResult: null, status: 'SCHEDULED' } }));
    this.bus.emit('standings', (await this.live.raw(id)).tournamentId);
    return this.live.summary(id);
  }

  /** Zera o jogo: apaga todos os lances e volta pra "agendado". */
  @Post(':id/reset')
  async reset(@Param('id') id: string) {
    // na fila do jogo: um lance que chega durante o "zerar" não sobra depois
    await this.live.mutate(
      id,
      () =>
        this.prisma.$transaction([
          this.prisma.matchEvent.deleteMany({ where: { matchId: id } }),
          this.prisma.match.update({ where: { id }, data: { seq: 0, status: 'SCHEDULED', startedAt: null, finishedAt: null, manualResult: null } }),
        ]),
      true,
    );
    log.info('match.reset', { match: id });
    return this.live.summary(id);
  }

  /** Puxa o elenco cadastrado de cada atlética pra escalação do jogo (mantém o que já tem). */
  @Post(':id/import-lineups')
  async importLineupsRoute(@Param('id') id: string) {
    const n = await this.importLineups(id);
    await this.live.refresh(id);
    this.bus.emit('staff', id); // console do mesário aberto recarrega a escalação
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

  private async validate(b: z.infer<typeof MatchBody>, participants?: unknown[], checkStaff = true) {
    const sport = await this.prisma.sport.findUnique({ where: { id: b.sportId } });
    if (!sport) throw new BadRequestException('Modalidade não encontrada.');
    const t = await this.prisma.tournament.findUnique({ where: { id: b.tournamentId } });
    if (!t) throw new BadRequestException('Torneio não encontrado.');
    if (!t.isSandbox) {
      const ids = [b.homeId, b.awayId].filter((x): x is string => !!x);
      if (ids.length && (await this.prisma.institution.count({ where: { id: { in: ids }, isSandbox: true } })))
        throw new BadRequestException('Atlética de teste (sandbox) não pode jogar em torneio real.');
    }
    if (sport.engine === 'RANKING') {
      if (!b.title) throw new BadRequestException('Dê um nome pra prova (ex.: 100m rasos).');
    } else {
      if (!b.homeId || !b.awayId) throw new BadRequestException('Escolha as duas atléticas.');
      if (b.homeId === b.awayId) throw new BadRequestException('Uma atlética não joga contra ela mesma.');
    }
    const genders = sport.genders.split(',').filter(Boolean);
    if (genders.length && !genders.includes(b.gender)) throw new BadRequestException(`${sport.name} não tem naipe ${b.gender === 'M' ? 'masculino' : b.gender === 'F' ? 'feminino' : 'misto'}.`);
    if (!checkStaff) return void participants;
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
    private gateway: LiveGateway,
  ) {}

  /** Quantos torcedores estão vendo cada jogo agora (o painel consulta a cada poucos segundos). */
  @Get('presence')
  presence(@Query('sandbox') sandbox?: string) {
    return this.gateway.presence(sandbox === '1');
  }

  @Get()
  async get(@CurrentUser() _me: AuthUser, @Query('sandbox') sandbox?: string) {
    const now = Date.now();
    const isSandbox = sandbox === '1';
    const dayStart = new Date(now - 6 * 3600_000);
    const dayEnd = new Date(now + 18 * 3600_000);
    const rows = await this.prisma.match.findMany({
      where: { isSandbox, OR: [{ status: 'LIVE' }, { scheduledAt: { gte: dayStart, lte: dayEnd } }] },
      orderBy: { scheduledAt: 'asc' },
      include: { mesario: { select: { id: true, name: true, phone: true } }, backupMesario: { select: { id: true, name: true, phone: true } } },
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
