import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { ConversationAccessService } from './conversation-access';

type SocketUser = {
  id: string;
  isSuperAdmin?: boolean;
  tenantRoles?: Array<{ tenantId: string }>;
};

@WebSocketGateway({
  cors: {
    origin: true,
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

  private readonly logger = new Logger(ChatsGateway.name);

  constructor(
    private readonly authService: AuthService,
    private readonly conversationAccess: ConversationAccessService,
    private readonly configService: ConfigService,
  ) {}

  /** Token del handshake: `auth.token` (web y móvil) o cabecera Authorization. */
  private extractToken(client: Socket): string | null {
    const fromAuth = client.handshake.auth?.token;
    if (typeof fromAuth === 'string' && fromAuth) return fromAuth;
    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);
    return null;
  }

  /**
   * Solo se une a la sala del tenant quien presenta un JWT válido y pertenece
   * a ese tenant. `WS_ALLOW_ANONYMOUS=true` restablece el comportamiento
   * anterior (sin autenticar) para una migración gradual de clientes antiguos.
   */
  async handleConnection(client: Socket) {
    const tenantId = client.handshake.query.tenantId as string | undefined;

    if (this.configService.get<string>('WS_ALLOW_ANONYMOUS') === 'true') {
      if (tenantId) client.join(`tenant:${tenantId}`);
      return;
    }

    const token = this.extractToken(client);
    const user = token ? ((await this.authService.authenticateToken(token)) as SocketUser | null) : null;
    const allowed =
      !!user &&
      !!tenantId &&
      (user.isSuperAdmin || !!user.tenantRoles?.some((tr) => tr.tenantId === tenantId));

    if (!user || !tenantId || !allowed) {
      this.logger.warn(`Rejected socket ${client.id}: ${user ? 'tenant not allowed' : 'invalid token'}`);
      client.emit('auth_error', { message: 'No autorizado' });
      client.disconnect(true);
      return;
    }

    client.data.user = user;
    client.join(`tenant:${tenantId}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage('join_conversation')
  async handleJoinConversation(client: Socket, conversationId: string) {
    if (typeof conversationId !== 'string') return;
    // Sin sesión validada (modo anónimo heredado) no se puede comprobar el acceso.
    if (client.data.user) {
      try {
        await this.conversationAccess.assertAccess(client.data.user as SocketUser, conversationId);
      } catch {
        return;
      }
    }
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
