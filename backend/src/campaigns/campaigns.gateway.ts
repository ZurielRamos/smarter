import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

export interface SendProgressPayload {
  status: string;
  totalRecipients: number;
  totalSent: number;
  totalFailed: number;
  error?: string;
}

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:4173', 'https://crm.strategee.us'],
    credentials: true,
  },
  namespace: '/ws/campaigns',
})
export class CampaignsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const tenantId = client.handshake.query.tenantId as string;
    if (tenantId) {
      client.join(`tenant:${tenantId}`);
    }
  }

  handleDisconnect(_client: Socket) {
    // cleanup handled by socket.io
  }

  @SubscribeMessage('join_send')
  handleJoinSend(client: Socket, sendId: string) {
    client.join(`send:${sendId}`);
  }

  @SubscribeMessage('leave_send')
  handleLeaveSend(client: Socket, sendId: string) {
    client.leave(`send:${sendId}`);
  }

  /** Emit progress update to all clients watching a specific send */
  emitSendProgress(sendId: string, tenantId: string, payload: SendProgressPayload) {
    this.server.to(`send:${sendId}`).emit('send_progress', { sendId, ...payload });
    this.server.to(`tenant:${tenantId}`).emit('send_progress', { sendId, ...payload });
  }
}
