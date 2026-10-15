// Registro estruturado (JSON Lines) pra investigar problemas depois.
//
// Cada linha de logs/app-AAAA-MM-DD.jsonl é um objeto:
//   { t, lvl, src, ev, msg?, req?, user?, ...dados }
// - src: 'api' (servidor) ou 'web' (navegador do torcedor/mesário/admin)
// - ev:  nome do acontecimento ("http", "http.error", "live.command", "staff.assign"...)
// - req: id da requisição (vem do navegador no header x-request-id e volta na resposta),
//        liga o erro que o usuário viu à linha do servidor
// Leia com `npm run logs` (api/scripts/logs.mjs). Nada de senha/token: ver redact().
import { ConsoleLogger } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { randomBytes } from 'crypto';
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, WriteStream } from 'fs';
import { join, resolve } from 'path';

export type Level = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
const RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };

export interface ReqCtx {
  req: string;
  user?: string; // "Nome <id> (PAPEL)"
}

export const LOG_DIR = resolve(process.env.LOG_DIR ?? join(__dirname, '..', '..', 'logs'));
const MIN: Level = (process.env.LOG_LEVEL as Level) in RANK ? (process.env.LOG_LEVEL as Level) : 'info';
const RETENTION_DAYS = Number(process.env.LOG_RETENTION_DAYS ?? 14);
// passou disso no dia, só warn/error entram (protege o disco num dia de pico)
const MAX_BYTES = Number(process.env.LOG_MAX_MB ?? 200) * 1024 * 1024;
const ECHO = process.env.NODE_ENV === 'production'; // em produção também vai pro stdout (logs do Fly)

export const reqStore = new AsyncLocalStorage<ReqCtx>();
export const newReqId = () => randomBytes(6).toString('hex');

// ---------------------------------------------------------------- arquivo

let stream: WriteStream | null = null;
let day = '';
let bytes = 0;

const dayOf = (d: Date) => {
  // dia local de Brasília (UTC-3), pra bater com o horário dos jogos
  const b = new Date(d.getTime() - 3 * 3600_000);
  return b.toISOString().slice(0, 10);
};

function file() {
  const today = dayOf(new Date());
  if (stream && today === day) return stream;
  stream?.end();
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
  day = today;
  const path = join(LOG_DIR, `app-${today}.jsonl`);
  bytes = existsSync(path) ? statSync(path).size : 0;
  stream = createWriteStream(path, { flags: 'a' });
  stream.on('error', () => (stream = null)); // disco cheio/sem permissão: segue sem arquivo
  prune();
  return stream;
}

function prune() {
  try {
    const limit = Date.now() - RETENTION_DAYS * 86_400_000;
    for (const f of readdirSync(LOG_DIR)) {
      const m = /^app-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(f);
      if (m && new Date(m[1]).getTime() < limit) unlinkSync(join(LOG_DIR, f));
    }
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- limpeza dos dados

const SECRET = /pass(word)?|token|authorization|secret|cookie|hash/i;
const HEAVY = /^(banner|logo|image|photo)$/i;

const LONG = /^(stack|component)$/; // texto longo que vale a pena guardar inteiro

/** Tira segredos, encurta textos enormes (data URLs) e limita a profundidade. */
export function redact(v: unknown, depth = 0, max = 600): unknown {
  if (v == null || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.length > max ? `${v.slice(0, Math.min(max, 400))}…[${v.length} chars]` : v;
  if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack?.split('\n').slice(0, 12).join('\n') };
  if (depth > 5) return '[…]';
  if (Array.isArray(v)) return v.length > 40 ? [...v.slice(0, 40).map((x) => redact(x, depth + 1)), `…+${v.length - 40}`] : v.map((x) => redact(x, depth + 1));
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (SECRET.test(k)) out[k] = '[oculto]';
      else if (HEAVY.test(k) && typeof x === 'string' && x.length > 120) out[k] = `[${x.length} chars]`;
      else out[k] = redact(x, depth + 1, LONG.test(k) ? 6000 : 600);
    }
    return out;
  }
  return String(v);
}

// ---------------------------------------------------------------- API

export function write(lvl: Level, ev: string, data: Record<string, unknown> = {}, src: 'api' | 'web' = 'api') {
  if (RANK[lvl] < RANK[MIN]) return;
  const ctx = reqStore.getStore();
  const line = JSON.stringify({
    t: new Date().toISOString(),
    lvl,
    src,
    ev,
    ...(ctx && src === 'api' && { req: ctx.req, ...(ctx.user && { user: ctx.user }) }),
    ...(redact(data) as object),
  });
  const s = file();
  if (s && (bytes < MAX_BYTES || RANK[lvl] >= RANK.warn)) {
    s.write(line + '\n');
    bytes += line.length + 1;
  }
  if (ECHO && RANK[lvl] >= RANK.info) process.stdout.write(line + '\n');
}

export const log = {
  debug: (ev: string, data?: Record<string, unknown>) => write('debug', ev, data),
  info: (ev: string, data?: Record<string, unknown>) => write('info', ev, data),
  warn: (ev: string, data?: Record<string, unknown>) => write('warn', ev, data),
  error: (ev: string, data?: Record<string, unknown>) => write('error', ev, data),
  fatal: (ev: string, data?: Record<string, unknown>) => write('fatal', ev, data),
};

/** Quem está fazendo a requisição atual (preenchido pelo AuthGuard). */
export function setLogUser(u: { id: string; name: string; role: string }) {
  const ctx = reqStore.getStore();
  if (ctx) ctx.user = `${u.name} <${u.id}> (${u.role})`;
}

// mapeamento de rotas/módulos na subida: só ruído no arquivo
const BOOT_NOISE = /^(RouterExplorer|RoutesResolver|InstanceLoader|NestFactory|WebSocketsController|NestApplication)$/;

/** Logger do Nest que, além do terminal, grava no arquivo (Logger('Live').warn(...) etc.). */
export class FileLogger extends ConsoleLogger {
  log(message: any, context?: string) {
    super.log(message, context);
    write(BOOT_NOISE.test(context ?? '') ? 'debug' : 'info', `nest.${context ?? 'app'}`, { msg: String(message) });
  }
  warn(message: any, context?: string) {
    super.warn(message, context);
    write('warn', `nest.${context ?? 'app'}`, { msg: String(message) });
  }
  error(message: any, stack?: string, context?: string) {
    super.error(message, stack, context);
    write('error', `nest.${context ?? 'app'}`, { msg: String(message), stack });
  }
}

/** Grava o que estiver pendente (no desligamento). */
export function flushLogs() {
  return new Promise<void>((r) => (stream ? stream.end(r) : r()));
}
