import {
  Body,
  CanActivate,
  Controller,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Get,
  Global,
  Injectable,
  Module,
  Post,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { parse } from '../common/util';
import type { Role } from '../shared/types';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  sportIds: string[];
}

const ROLES_KEY = 'roles';
/** Restringe a rota aos papéis informados (sempre exige login). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);

@Injectable()
export class AuthService {
  // cache curto pra não bater no banco a cada clique do mesário
  private cache = new Map<string, { user: AuthUser | null; at: number }>();

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  hash(password: string) {
    return bcrypt.hash(password, 10);
  }

  async login(email: string, password: string) {
    const u = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() }, include: { sports: true } });
    if (!u || !u.active || !(await bcrypt.compare(password, u.passwordHash))) throw new UnauthorizedException('E-mail ou senha incorretos.');
    const user: AuthUser = { id: u.id, name: u.name, email: u.email, role: u.role as Role, sportIds: u.sports.map((s) => s.sportId) };
    return { token: await this.jwt.signAsync({ sub: u.id, role: u.role }), user };
  }

  async resolve(token: string): Promise<AuthUser> {
    let sub: string;
    try {
      sub = (await this.jwt.verifyAsync<{ sub: string }>(token)).sub;
    } catch {
      throw new UnauthorizedException('Sessão expirada. Entre de novo.');
    }
    const hit = this.cache.get(sub);
    if (hit && Date.now() - hit.at < 15_000) {
      if (!hit.user) throw new UnauthorizedException('Usuário desativado.');
      return hit.user;
    }
    const u = await this.prisma.user.findUnique({ where: { id: sub }, include: { sports: true } });
    const user = u && u.active ? { id: u.id, name: u.name, email: u.email, role: u.role as Role, sportIds: u.sports.map((s) => s.sportId) } : null;
    this.cache.set(sub, { user, at: Date.now() });
    if (!user) throw new UnauthorizedException('Usuário desativado.');
    return user;
  }

  forget(userId: string) {
    this.cache.delete(userId);
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private auth: AuthService,
    private reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Faça login.');
    req.user = await this.auth.resolve(token);
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length && !roles.includes(req.user.role)) throw new ForbiddenException('Sem permissão para isso.');
    return true;
  }
}

const LoginBody = z.object({ email: z.string().email('e-mail inválido'), password: z.string().min(1, 'informe a senha') });

@Controller('api/auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  login(@Body() body: unknown) {
    const { email, password } = parse(LoginBody, body);
    return this.auth.login(email, password);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({ secret: process.env.JWT_SECRET || 'dev-secret-troque', signOptions: { expiresIn: '7d' } }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
