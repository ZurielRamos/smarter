import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:4173', 'https://crm.strategee.us'],
    credentials: true,
  },
  namespace: '/ws',
  pingInterval: 10000,
  pingTimeout: 5000,
  transports: ['websocket', 'polling'],
})
export class ChatsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Track connected clients by tenant
  private tenantRooms = new Map<string, Set<string>>();

  handleConnection(client: Socket) {
    const tenantId = client.handshake.query.tenantId as string;
    console.log(`[WS] Client ${client.id} connecting, tenantId: ${tenantId}, origin: ${client.handshake.headers.origin}`);
    if (tenantId) {
      client.join(`tenant:${tenantId}`);
      console.log(`[WS] Client ${client.id} joined tenant:${tenantId}`);
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`[WS] Client ${client.id} disconnected`);
  }

  @SubscribeMessage('join_conversation')
  handleJoinConversation(client: Socket, conversationId: string) {
    client.join(`conversation:${conversationId}`);
  }

  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(client: Socket, conversationId: string) {
    client.leave(`conversation:${conversationId}`);
  }

  // === EMIT METHODS (called from the service) ===

  /** Notify all agents in a tenant about a new/updated conversation */
  emitConversationUpdate(tenantId: string, conversation: any) {
    this.server.to(`tenant:${tenantId}`).emit('conversation_updated', conversation);
  }

  /** Notify agents viewing a specific conversation about a new message */
  emitNewMessage(tenantId: string, conversationId: string, message: any) {
    this.server.to(`tenant:${tenantId}`).emit('new_message', { conversationId, message });
    this.server.to(`conversation:${conversationId}`).emit('message', message);
  }

  /** Notify about message status updates */
  emitMessageStatus(conversationId: string, messageId: string, status: string) {
    this.server.to(`conversation:${conversationId}`).emit('message_status', { messageId, status });
  }

  /** Notify about typing indicators */
  emitTyping(conversationId: string, userId: string, isTyping: boolean) {
    this.server.to(`conversation:${conversationId}`).emit('typing', { userId, isTyping });
  }
}
