import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server } from 'ws';
import { IncomingMessage } from 'http';
import { parse } from 'url';

interface WidgetClient {
  ws: any;
  inboxId: string;
  visitorId: string;
  conversationId: string;
}

/**
 * Dedicated WebSocket gateway for chat widget visitors.
 * Uses raw WebSocket (ws) at path /ws/chat-widget to avoid
 * requiring socket.io on the embeddable widget.
 */
@WebSocketGateway({
  path: '/ws/chat-widget',
  cors: { origin: true },
})
export class ChatWidgetGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // conversationId -> Set of connected widget clients
  private clients = new Map<string, Set<WidgetClient>>();

  handleConnection(client: any, req: IncomingMessage) {
    const { query } = parse(req.url || '', true);
    const inboxId = query.inboxId as string;
    const visitorId = query.visitorId as string;
    const conversationId = query.conversationId as string;

    if (!inboxId || !visitorId || !conversationId) {
      client.close(4000, 'Missing parameters');
      return;
    }

    const widgetClient: WidgetClient = { ws: client, inboxId, visitorId, conversationId };
    client.__widgetData = widgetClient;

    if (!this.clients.has(conversationId)) {
      this.clients.set(conversationId, new Set());
    }
    this.clients.get(conversationId)!.add(widgetClient);
  }

  handleDisconnect(client: any) {
    const data = client.__widgetData as WidgetClient | undefined;
    if (data) {
      const set = this.clients.get(data.conversationId);
      if (set) {
        set.delete(data);
        if (set.size === 0) this.clients.delete(data.conversationId);
      }
    }
  }

  /**
   * Send a message to all widget clients connected to a given conversation.
   * Called from ChatsService when an agent sends a reply.
   */
  sendToVisitor(conversationId: string, payload: { type: string; content: string; direction: string; messageId?: string }) {
    const set = this.clients.get(conversationId);
    if (!set) return;
    const data = JSON.stringify(payload);
    for (const client of set) {
      try {
        if (client.ws.readyState === 1) { // WebSocket.OPEN
          client.ws.send(data);
        }
      } catch {}
    }
  }
}
