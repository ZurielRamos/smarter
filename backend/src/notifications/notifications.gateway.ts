import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PresenceService } from './presence.service';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:4173', 'https://crm.strategee.us'],
    credentials: true,
  },
  namespace: '/ws/notifications',
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly presenceService: PresenceService) {}

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    const tenantId = client.handshake.query.tenantId as string;

    if (userId) {
      client.join(`user:${userId}`);
      client.data.userId = userId;
      client.data.tenantId = tenantId;

      // Mark user online
      const presence = this.presenceService.setOnline(userId);

      // Notify tenant members about presence change
      if (tenantId) {
        client.join(`tenant:${tenantId}`);
        this.server.to(`tenant:${tenantId}`).emit('presence:update', presence);
      }

      console.log(`[WS/Notifications] Client ${client.id} connected — user:${userId} (online)`);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId as string;
    const tenantId = client.data.tenantId as string;

    if (userId) {
      const presence = this.presenceService.setOffline(userId);

      // Notify tenant members about presence change
      if (tenantId && presence.status === 'offline') {
        this.server.to(`tenant:${tenantId}`).emit('presence:update', presence);
      }

      console.log(`[WS/Notifications] Client ${client.id} disconnected — user:${userId} (${presence.status})`);
    }
  }

  @SubscribeMessage('join_user')
  handleJoinUser(client: Socket, userId: string) {
    client.join(`user:${userId}`);
  }

  @SubscribeMessage('presence:set')
  handleSetPresence(client: Socket, status: string) {
    const userId = client.data.userId as string;
    const tenantId = client.data.tenantId as string;

    if (userId && ['online', 'offline', 'away'].includes(status)) {
      const presence = this.presenceService.setStatus(userId, status as 'online' | 'offline' | 'away');
      if (tenantId) {
        this.server.to(`tenant:${tenantId}`).emit('presence:update', presence);
      }
    }
  }

  @SubscribeMessage('presence:get')
  handleGetPresence(client: Socket, userIds: string[]) {
    const presences = this.presenceService.getPresenceByTenant(userIds);
    client.emit('presence:list', presences);
  }

  /** Emit a new notification to a specific user */
  emitNotification(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification:new', notification);
  }

  /** Emit updated unread count to a specific user */
  emitUnreadCount(userId: string, count: number) {
    this.server.to(`user:${userId}`).emit('notification:unread_count', { count });
  }
}
