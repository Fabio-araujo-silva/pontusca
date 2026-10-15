import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'fs';
import { join } from 'path';
import { AthletesController, InstitutionsController, SportsController, TournamentsController, UsersController } from './admin/catalog.controller';
import { DashboardController, MatchesController } from './admin/matches.controller';
import { ScoringController } from './admin/scoring.controller';
import { AuthModule } from './auth/auth';
import { ClientLogController } from './common/http-log';
import { LiveGateway } from './live/live.gateway';
import { LiveBus, LiveService } from './live/live.service';
import { MesaController } from './live/mesa.controller';
import { PrismaModule } from './prisma/prisma.service';
import { FeedService, PublicController } from './public/public.controller';
import { SandboxController } from './sandbox/sandbox.controller';
import { SandboxService } from './sandbox/sandbox.service';
import { StandingsService } from './standings/standings.service';

// Em produção o próprio Nest serve o front buildado (web/dist) com fallback de SPA.
const WEB_DIST = [join(__dirname, '..', '..', 'web', 'dist'), join(__dirname, '..', 'public')].find((p) => existsSync(p));

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ...(WEB_DIST ? [ServeStaticModule.forRoot({ rootPath: WEB_DIST, exclude: ['/api/(.*)', '/socket.io/(.*)'], serveStaticOptions: { maxAge: '1h', index: false } })] : []),
  ],
  controllers: [
    PublicController,
    MesaController,
    InstitutionsController,
    SportsController,
    TournamentsController,
    AthletesController,
    UsersController,
    MatchesController,
    DashboardController,
    ScoringController,
    SandboxController,
    ClientLogController,
  ],
  providers: [LiveBus, LiveService, LiveGateway, FeedService, StandingsService, SandboxService],
})
export class AppModule {}
