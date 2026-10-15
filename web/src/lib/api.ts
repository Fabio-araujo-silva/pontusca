// Cliente HTTP fino. Em dev o Vite faz proxy de /api pro Nest (porta 3000).
// Cada chamada leva um x-request-id: o mesmo id aparece no registro do servidor
// (api/logs) e no registro de erro do navegador, ligando as duas pontas.
import { report } from './log';

const TOKEN_KEY = 'arq.token';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public requestId?: string,
  ) {
    super(message);
  }
}

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* modo privado */
    }
  },
};

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function api<T = any>(path: string, opts: { method?: Method; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const token = tokenStore.get();
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  const requestId = rid();
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        'x-request-id': requestId,
        ...(opts.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    // sem rede / servidor fora: registra (vai quando a rede voltar) e repassa
    if ((e as Error)?.name !== 'AbortError') report('warn', 'api.network', { msg: `${method} ${path}: ${(e as Error)?.message}`, req: requestId, data: { online: navigator.onLine } });
    throw e;
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg = (data && (Array.isArray(data.message) ? data.message[0] : data.message)) || `Erro ${res.status}`;
    if (res.status === 401) window.dispatchEvent(new Event('arq:unauthorized'));
    else report(res.status >= 500 ? 'error' : 'warn', 'api.error', { msg: `${method} ${path} -> ${res.status}: ${msg}`, req: requestId, data: method === 'GET' ? undefined : { body: redactBody(opts.body) } });
    throw new ApiError(msg, res.status, requestId);
  }
  return data as T;
}

function rid() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return 'w' + Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Corpo resumido pro registro: sem senha e sem imagens em base64. */
function redactBody(b: unknown): unknown {
  if (!b || typeof b !== 'object') return b;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(b as Record<string, unknown>)) out[k] = /pass|token/i.test(k) ? '[oculto]' : typeof v === 'string' && v.length > 300 ? `[${v.length} chars]` : v;
  return out;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return { message: t };
  }
}

export const get = <T = any>(p: string) => api<T>(p);
export const post = <T = any>(p: string, body?: unknown) => api<T>(p, { method: 'POST', body: body ?? {} });
export const put = <T = any>(p: string, body: unknown) => api<T>(p, { method: 'PUT', body });
export const patch = <T = any>(p: string, body: unknown) => api<T>(p, { method: 'PATCH', body });
export const del = <T = any>(p: string) => api<T>(p, { method: 'DELETE' });
