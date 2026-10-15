// Registro de erros do navegador -> servidor (POST /api/logs -> api/logs/*.jsonl).
// Junta em lotes, guarda no aparelho enquanto está sem rede (mesário na quadra)
// e manda quando a conexão volta ou a página fecha.
const KEY = 'arq.logs';
const MAX_KEPT = 100;

export type LogLevel = 'info' | 'warn' | 'error';
interface Entry {
  lvl: LogLevel;
  ev: string;
  msg?: string;
  stack?: string;
  url?: string;
  req?: string;
  at: number;
  data?: Record<string, unknown>;
}

const session = Math.random().toString(36).slice(2, 10);
let queue: Entry[] = load();
let timer: ReturnType<typeof setTimeout> | undefined;
let sending = false;
const recent = new Map<string, number>(); // anti-spam: o mesmo erro em loop vira 1 linha a cada 10 s

function load(): Entry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.slice(-MAX_KEPT) : [];
  } catch {
    return [];
  }
}

function save() {
  try {
    if (queue.length) localStorage.setItem(KEY, JSON.stringify(queue.slice(-MAX_KEPT)));
    else localStorage.removeItem(KEY);
  } catch {
    /* modo privado / cheio */
  }
}

const appName = () => {
  const p = location.pathname;
  return p.startsWith('/mesa') ? 'mesa' : p.startsWith(import.meta.env.VITE_ADMIN_PATH ?? '/bastidores') ? 'admin' : 'publico';
};

function body(entries: Entry[]) {
  return JSON.stringify({ session, app: appName(), ua: navigator.userAgent.slice(0, 300), entries });
}

async function flush(beacon = false) {
  if (!queue.length || sending) return;
  if (!navigator.onLine && !beacon) return; // volta no evento 'online'
  const batch = queue.slice(0, 30);
  if (beacon && navigator.sendBeacon) {
    if (navigator.sendBeacon('/api/logs', new Blob([body(batch)], { type: 'application/json' }))) {
      queue = queue.slice(batch.length);
      save();
    }
    return;
  }
  sending = true;
  try {
    let token: string | null = null;
    try {
      token = localStorage.getItem('arq.token');
    } catch {
      /* ignore */
    }
    const r = await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: body(batch),
      keepalive: true,
    });
    // 4xx = lote inválido: descarta pra não travar a fila; 5xx/rede = tenta depois
    if (r.ok || (r.status >= 400 && r.status < 500)) {
      queue = queue.slice(batch.length);
      save();
      if (queue.length) schedule(500);
    } else schedule(15_000);
  } catch {
    schedule(15_000);
  } finally {
    sending = false;
  }
}

function schedule(ms = 2_000) {
  clearTimeout(timer);
  timer = setTimeout(() => void flush(), ms);
}

export function report(lvl: LogLevel, ev: string, info: { msg?: string; err?: unknown; req?: string; data?: Record<string, unknown> } = {}) {
  // milhares de torcedores: do site público só vão avisos e erros
  if (lvl === 'info' && appName() === 'publico') return;
  const err = info.err as { message?: string; stack?: string } | undefined;
  const msg = (info.msg ?? err?.message ?? '').slice(0, 2000);
  const sig = `${ev}|${msg}`;
  const now = Date.now();
  if ((recent.get(sig) ?? 0) > now - 10_000) return;
  recent.set(sig, now);
  if (recent.size > 200) recent.clear();
  queue.push({ lvl, ev, msg: msg || undefined, stack: err?.stack?.slice(0, 6000), url: location.pathname + location.search, req: info.req, at: now, data: info.data });
  if (queue.length > MAX_KEPT) queue = queue.slice(-MAX_KEPT);
  save();
  if (import.meta.env.DEV && lvl !== 'info') console.warn(`[log] ${ev}`, msg, info.data ?? '');
  schedule(lvl === 'error' ? 300 : 2_000);
}

let installed = false;
/** Captura erros não tratados da página toda. Chamado uma vez no main.tsx. */
export function installErrorLogging() {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (e) => {
    // erro de recurso (img/script) não tem e.error
    if (e.error) report('error', 'window.error', { err: e.error });
    else if (e.message) report('error', 'window.error', { msg: `${e.message} @ ${e.filename}:${e.lineno}` });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    // ApiError já é registrado onde acontece
    if (r && typeof r === 'object' && 'status' in r) return;
    report('error', 'promise.unhandled', { err: r instanceof Error ? r : undefined, msg: r instanceof Error ? undefined : String(r) });
  });
  window.addEventListener('online', () => schedule(200));
  window.addEventListener('pagehide', () => void flush(true));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void flush(true));
  if (queue.length) schedule(1_000); // sobrou da última vez (ex.: travou sem rede)
}
