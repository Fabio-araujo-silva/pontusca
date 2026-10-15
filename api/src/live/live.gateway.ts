import { Logger, OnModuleInit } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import type { Highlight, MatchSummary } from '../shared/types';
import { LiveBus } from './live.service';

const ROOM = /^(feed|feed:sandbox|match:[a-z0-9]{10,40})$/;

/**
 * Tempo real. Salas:
 *  - feed / feed:sandbox -> resumo de TODOS os jogos (placar do card)
 *  - match:<id>          -> quem está com o card expandido
 */
@WebSocketGateway({ namespace: '/live', cors: { origin: true, credentials: true }, transports: ['websocket', 'polling'], perMessageDeflate: false })
export class LiveGateway implements OnGatewayConnection, OnModuleInit {
  private log = new Logger('Gateway');
  @WebSocketServer() server!: Namespace;

  constructor(private bus: LiveBus) {}

  onModuleInit() {
    this.bus.on('summary', (summary: MatchSummary, highlight: Highlight | null) => {
      const feed = summary.isSandbox ? 'feed:sandbox' : 'feed';
      this.server.to(feed).to(`match:${summary.id}`).emit('summary', { summary, highlight });
    });
    this.bus.on('feed', (p: { tournamentId: string; isSandbox: boolean }) => {
      this.server.to(p.isSandbox ? 'feed:sandbox' : 'feed').emit('feed:changed', p);
    });
    this.bus.on('standings', (tournamentId: string) => this.server.emit('standings:changed', { tournamentId }));
    this.bus.on('catalog', () => this.server.emit('catalog:changed', {}));
    // escala/permissão mudou (ex.: admin liberou o reserva) -> console do mesário recarrega
    this.bus.on('staff', (matchId: string) => this.server.to(`match:${matchId}`).emit('staff:changed', { matchId }));
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

  @SubscribeMessage('time')
  time() {
    return { serverTime: Date.now() };
  }
}
