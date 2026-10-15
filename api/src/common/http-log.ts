// Registro das requisições HTTP, captura de erros e recepção dos erros do navegador.
import { ArgumentsHost, Body, Catch, Controller, ExceptionFilter, Headers, HttpCode, HttpException, Ip, Post } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { performance } from 'perf_hooks';
import { z } from 'zod';
import { AuthService } from '../auth/auth';
import { log, newReqId, ReqCtx, reqStore, write } from './log';
import { parse } from './util';

const REQ_ID = /^[a-zA-Z0-9-]{6,40}$/;
const SLOW_MS = Number(process.env.LOG_SLOW_MS ?? 800);
// polling frequente: só entra no registro se der erro ou demorar
const QUIET = /^\/api\/(admin\/dashboard\/presence|public\/time|logs)$/;

/**
 * Middleware: dá um id a cada requisição (ou usa o que o navegador mandou),
 * devolve no header x-request-id e grava uma linha quando ela termina.
 * GET com sucesso só vira linha se for lento; escrita sempre (com o corpo, sem segredos).
 */
export function requestLog(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith('/api/')) return next();
  const incoming = req.headers['x-request-id'];
  const ctx: ReqCtx = { req: typeof incoming === 'string' && REQ_ID.test(incoming) ? incoming : newReqId() };
  res.setHeader('x-request-id', ctx.req);
  const t0 = performance.now();
  res.on('finish', () => {
    const ms = Math.round(performance.now() - t0);
    const status = res.statusCode;
    const write_ = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
    const quiet = QUIET.test(req.path);
    const lvl = status >= 500 ? 'error' : status >= 400 ? 'warn' : ms > SLOW_MS ? 'warn' : write_ && !quiet ? 'info' : 'debug';
    if (lvl === 'debug' && quiet) return;
    reqStore.run(ctx, () =>
      write(lvl, ms > SLOW_MS && status < 400 ? 'http.slow' : 'http', {
        method: req.method,
        path: req.originalUrl.slice(0, 300),
        status,
        ms,
        ip: req.ip,
        ...(write_ && !quiet && req.body && Object.keys(req.body).length > 0 && { body: req.body }),
        ...(status >= 400 && (res.locals.errMessage as string | undefined) && { msg: res.locals.errMessage }),
      }),
    );
  });
  reqStore.run(ctx, next);
}

/**
 * Todo erro HTTP passa aqui: 4xx volta a mensagem de sempre; 5xx é gravado com
 * stack e corpo da requisição. A resposta leva o `requestId` pra achar no registro.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') {
      log.error('ws.error', { err: exception });
      return;
    }
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const requestId = reqStore.getStore()?.req ?? (res.getHeader('x-request-id') as string | undefined);
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const raw = exception instanceof HttpException ? exception.getResponse() : null;
    const payload: Record<string, unknown> =
      raw == null
        ? { statusCode: 500, message: `Erro interno no servidor. Código: ${requestId}` }
        : typeof raw === 'string'
          ? { statusCode: status, message: raw }
          : { ...(raw as object) };
    const msg = Array.isArray(payload.message) ? payload.message[0] : payload.message;
    res.locals.errMessage = typeof msg === 'string' ? msg : undefined;
    if (status >= 500) log.error('http.error', { method: req.method, path: req.originalUrl, status, err: exception, body: req.body, query: req.query });
    if (res.headersSent) return;
    res.status(status).json({ ...payload, requestId });
  }
}

// ---------------------------------------------------------------- erros do navegador

const Entry = z.object({
  lvl: z.enum(['info', 'warn', 'error']),
  ev: z.string().max(60),
  msg: z.string().max(2000).optional(),
  stack: z.string().max(6000).optional(),
  url: z.string().max(300).optional(),
  req: z.string().max(40).optional(),
  at: z.number().optional(),
  data: z.record(z.unknown()).optional(),
});
const ClientBody = z.object({
  session: z.string().max(40),
  app: z.string().max(40).optional(), // publico | mesa | admin
  ua: z.string().max(300).optional(),
  entries: z.array(Entry).min(1).max(30),
});

/** Limite simples por IP pra ninguém lotar o disco mandando log. */
const bucket = new Map<string, { n: number; reset: number }>();
function allow(ip: string, n: number) {
  const now = Date.now();
  const b = bucket.get(ip);
  if (!b || b.reset < now) {
    if (bucket.size > 5000) bucket.clear();
    bucket.set(ip, { n, reset: now + 60_000 });
    return true;
  }
  b.n += n;
  return b.n <= 150;
}

@Controller('api/logs')
export class ClientLogController {
  constructor(private auth: AuthService) {}

  @Post()
  @HttpCode(204)
  async ingest(@Body() body: unknown, @Ip() ip: string, @Headers('authorization') authz?: string) {
    const b = parse(ClientBody, body);
    if (!allow(ip, b.entries.length)) return;
    let user: string | undefined;
    if (authz?.startsWith('Bearer ')) {
      try {
        const u = await this.auth.resolve(authz.slice(7));
        user = `${u.name} <${u.id}> (${u.role})`;
      } catch {
        /* sessão expirada: registra como anônimo */
      }
    }
    for (const e of b.entries) {
      write(
        e.lvl,
        `web.${e.ev}`,
        {
          msg: e.msg,
          stack: e.stack,
          url: e.url,
          ...(e.req && { req: e.req }),
          ...(e.at && { at: new Date(e.at).toISOString() }),
          session: b.session,
          app: b.app,
          ua: b.ua,
          ip,
          ...(user && { user }),
          ...(e.data && { data: e.data }),
        },
        'web',
      );
    }
  }
}
