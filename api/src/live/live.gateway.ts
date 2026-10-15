import { Logger, OnModuleInit } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import type { Highlight, MatchSummary } from '../shared/types';
import { LiveBus } from './live.service';

const ROOM = /^(feed|feed:sandbox|ops|ops:sandbox|mesa|match:[a-z0-9]{10,40})$/;
const MATCH_ID = /^[a-z0-9]{10,40}$/;

export interface Presence {
  /** abas do site público abertas agora */
  online: number;
  /** por jogo: na tela (card visível ou aberto) e aberto (lance a lance) */
  matches: Record<string, { watching: number; open: number }>;
}

/**
 * Tempo real. Salas:
 *  - feed / feed:sandbox -> torcedores: `tick` enxuto de todos os jogos (só o que muda no lance)
 *  - ops / ops:sandbox   -> painel do admin e tela inicial do mesário: `summary` completo
 *  - match:<id>          -> quem está com o card expandido
 *  - mesa                -> telas iniciais dos mesários (escala mudou)
 * Audiência (só o site público manda `watch`; staff não conta):
 *  - aud:<env>            -> torcedores com o site aberto
 *  - w:<env>:<id>         -> com o card na tela
 *  - o:<env>:<id>         -> com o jogo aberto
 */
@WebSocketGateway({ namespace: '/live', cors: { origin: true, credentials: true }, transports: ['websocket', 'polling'], perMessageDeflate: false })
export class LiveGateway implements OnGatewayConnection, OnModuleInit {
  private log = new Logger('Gateway');
  @WebSocketServer() server!: Namespace;

  constructor(private bus: LiveBus) {}

  onModuleInit() {
    this.bus.on('summary', (summary: MatchSummary, highlight: Highlight | null) => {
      const sb = summary.isSandbox;
      this.server.to(`match:${summary.id}`).to(sb ? 'ops:sandbox' : 'ops').emit('summary', { summary, highlight });
      // milhares de torcedores: só os campos que mudam num lance (~metade do tamanho).
      // Venue, times, horário etc. já estão no feed; mudaram -> `feed:changed`.
      const { nextActions: _n, suggestEnd: _s, ...live } = summary.live;
      const { id, tournamentId, seq, status, score, winner, wo, manual, lastEvent, updatedAt, isSandbox } = summary;
      this.server.to(sb ? 'feed:sandbox' : 'feed').emit('tick', { t: { id, tournamentId, seq, status, score, live, winner, wo, manual, lastEvent, updatedAt, isSandbox }, h: highlight });
    });
    this.bus.on('feed', (p: { tournamentId: string; isSandbox: boolean }) => {
      this.server.to(p.isSandbox ? ['feed:sandbox', 'ops:sandbox'] : ['feed', 'ops']).emit('feed:changed', p);
    });
    this.bus.on('standings', (tournamentId: string) => this.server.to(['feed', 'feed:sandbox', 'ops', 'ops:sandbox']).emit('standings:changed', { tournamentId }));
    this.bus.on('catalog', () => this.server.to(['feed', 'feed:sandbox', 'ops', 'ops:sandbox', 'mesa']).emit('catalog:changed', {}));
    // escala/permissão mudou (ex.: admin liberou o reserva) -> console do mesário recarrega
    this.bus.on('staff', (matchId: string) => this.server.to(`match:${matchId}`).to('mesa').emit('staff:changed', { matchId }));
  }

  handleConnection(client: Socket) {
    client.emit('hello', { serverTime: Date.now() });
  }

  @SubscribeMessage('join')
  join(@ConnectedSocket() client: Socket, @MessageBody() rooms: unknown) {
    const list = Array.isArray(rooms) ? rooms.filter((r): r is string => typeof r === 'string' && ROOM.test(r)).slice(0, 20) : [];
    void client.join(list);
    return { serverTime: Date.now(), rooms: list };
  }

  @SubscribeMessage('leave')
  leave(@ConnectedSocket() client: Socket, @MessageBody() rooms: unknown) {
    if (Array.isArray(rooms)) for (const r of rooms) if (typeof r === 'string') void client.leave(r);
    return { ok: true };
  }

  /** O site público avisa o que está na tela. Substitui o estado anterior do socket. */
  @SubscribeMessage('watch')
  watch(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const b = (body && typeof body === 'object' ? body : {}) as { sandbox?: unknown; open?: unknown; watching?: unknown; off?: unknown };
    for (const r of [...client.rooms]) if (r.startsWith('aud:') || r.startsWith('w:') || r.startsWith('o:')) void client.leave(r);
    if (b.off === true) return { ok: true };
    const env = b.sandbox === true ? 'sandbox' : 'real';
    const ids = new Set(Array.isArray(b.watching) ? b.watching.filter((x): x is string => typeof x === 'string' && MATCH_ID.test(x)).slice(0, 30) : []);
    const open = typeof b.open === 'string' && MATCH_ID.test(b.open) ? b.open : null;
    if (open) ids.add(open);
    void client.join([`aud:${env}`, ...[...ids].map((id) => `w:${env}:${id}`), ...(open ? [`o:${env}:${open}`] : [])]);
    return { ok: true };
  }

  presence(sandbox: boolean): Presence {
    const env = sandbox ? 'sandbox' : 'real';
    const rooms = this.server.adapter.rooms;
    const matches: Presence['matches'] = {};
    const slot = (id: string) => (matches[id] ??= { watching: 0, open: 0 });
    for (const [name, set] of rooms) {
      if (name.startsWith(`w:${env}:`)) slot(name.slice(env.length + 3)).watching = set.size;
      else if (name.startsWith(`o:${env}:`)) slot(name.slice(env.length + 3)).open = set.size;
    }
    return { online: rooms.get(`aud:${env}`)?.size ?? 0, matches };
  }

  @SubscribeMessage('time')
  time() {
    return { serverTime: Date.now() };
  }
}
