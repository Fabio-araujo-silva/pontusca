import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, Roles } from '../auth/auth';
import { parse } from '../common/util';
import { SandboxService } from './sandbox.service';

const GenerateBody = z.object({
  matches: z.number().int().min(1).max(120).optional(),
  live: z.number().int().min(0).max(40).optional(),
  finished: z.number().int().min(0).max(40).optional(),
  sportIds: z.array(z.string()).optional(),
  fullDay: z.boolean().optional(),
  allTeams: z.boolean().optional(),
});

@Controller('api/admin/sandbox')
@UseGuards(AuthGuard)
@Roles('ADMIN')
export class SandboxController {
  constructor(private sandbox: SandboxService) {}

  @Get()
  status() {
    return this.sandbox.status();
  }

  @Post('generate')
  generate(@Body() body: unknown) {
    return this.sandbox.generate(parse(GenerateBody, body ?? {}));
  }

  @Post('start')
  start(@Body() body: unknown) {
    const { speed } = parse(z.object({ speed: z.number().min(0.25).max(10).default(1) }), body ?? {});
    return this.sandbox.start(speed);
  }

  @Post('stop')
  stop() {
    return this.sandbox.stop();
  }

  @Post('clear')
  clear() {
    return this.sandbox.clear();
  }
}
