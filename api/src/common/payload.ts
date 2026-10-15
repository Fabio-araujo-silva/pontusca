// Resposta JSON "pronta pra servir": o texto, o gzip e o ETag são calculados UMA
// vez por versão (não a cada torcedor). Milhares de pedidos iguais = só copiar bytes.
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { gzipSync } from 'zlib';

export class Payload {
  private gz?: Buffer;
  readonly etag: string;

  constructor(readonly json: string) {
    this.etag = `"${createHash('sha1').update(json).digest('base64url').slice(0, 20)}"`;
  }

  gzip() {
    return (this.gz ??= gzipSync(this.json, { level: 6 }));
  }
}

/** Envia com cache HTTP: 304 se o navegador já tem essa versão, gzip pronto se aceitar. */
export function sendPayload(req: Request, res: Response, p: Payload, maxAge: number) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
  res.setHeader('ETag', p.etag);
  res.setHeader('Vary', 'Accept-Encoding');
  if (req.headers['if-none-match'] === p.etag) {
    res.status(304).end();
    return;
  }
  // o middleware `compression` pula respostas que já têm Content-Encoding
  if (p.json.length > 1024 && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
    const body = p.gzip();
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Content-Length', body.length);
    res.end(body);
    return;
  }
  res.setHeader('Content-Length', Buffer.byteLength(p.json));
  res.end(p.json);
}

/**
 * Junta pedidos simultâneos pela mesma chave numa só execução (ex.: 3 mil
 * torcedores pedindo o feed no mesmo segundo depois de uma edição = 1 montagem).
 */
export class Coalescer<T> {
  private inflight = new Map<string, Promise<T>>();

  run(key: string, fn: () => Promise<T>): Promise<T> {
    let p = this.inflight.get(key);
    if (!p) {
      p = fn().finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    return p;
  }
}
