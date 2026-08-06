import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './notification.entity';
import { NotificationsGateway } from './notifications.gateway';
import { User } from '../users/user.entity';

export interface NotifyParams {
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly gateway: NotificationsGateway,
  ) {}

  /**
   * Create a notification, persist it, and emit via WebSocket.
   * Respects user notification preferences.
   */
  async notify(params: NotifyParams): Promise<Notification | null> {
    // Check user notification preferences
    const user = await this.userRepo.findOne({
      where: { id: params.userId },
      select: { id: true, notificationPreferences: true },
    });
    if (user?.notificationPreferences?.[params.type] === false) {
      return null; // User has disabled this notification type
    }

    const notification = this.notificationRepo.create({
      tenantId: params.tenantId,
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body || null,
      link: params.link || null,
      metadata: params.metadata || null,
      read: false,
      readAt: null,
    });

    const saved = await this.notificationRepo.save(notification);

    // Emit via WebSocket
    this.gateway.emitNotification(params.userId, saved);

    return saved;
  }

  /**
   * Notify multiple users at once (e.g., all collaborators of an inbox).
   */
  async notifyMany(userIds: string[], params: Omit<NotifyParams, 'userId'>): Promise<void> {
    for (const userId of userIds) {
      this.notify({ ...params, userId }).catch(() => {});
    }
  }

  async findByUser(userId: string, limit = 20, offset = 0): Promise<{ data: Notification[]; total: number }> {
    const [data, total] = await this.notificationRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { data, total };
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.notificationRepo.count({
      where: { userId, read: false },
    });
    return { count };
  }

  async markAsRead(id: string): Promise<Notification> {
    await this.notificationRepo.update(id, { read: true, readAt: new Date() });
    return this.notificationRepo.findOneByOrFail({ id });
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepo.update(
      { userId, read: false },
      { read: true, readAt: new Date() },
    );
  }

  async delete(id: string): Promise<void> {
    await this.notificationRepo.delete(id);
  }

  /**
   * Find an existing unread notification for a specific conversation and user.
   */
  async findUnreadByConversation(userId: string, conversationId: string): Promise<Notification | null> {
    return this.notificationRepo.findOne({
      where: { userId, read: false, type: 'message_received' },
      order: { createdAt: 'DESC' },
    }).then((n) => {
      if (n && n.metadata && (n.metadata as any).conversationId === conversationId) return n;
      // Fallback: query with raw condition
      return this.notificationRepo
        .createQueryBuilder('n')
        .where('n.user_id = :userId', { userId })
        .andWhere('n.read = false')
        .andWhere('n.type = :type', { type: 'message_received' })
        .andWhere("n.metadata->>'conversationId' = :conversationId", { conversationId })
        .orderBy('n.created_at', 'DESC')
        .getOne();
    });
  }

  /**
   * Update the body of an existing notification (e.g., with the latest message).
   * Also re-emits via WebSocket so the frontend can show a toast.
   */
  async updateBody(id: string, body: string): Promise<void> {
    await this.notificationRepo.update(id, { body, createdAt: new Date() });
    const updated = await this.notificationRepo.findOneBy({ id });
    if (updated) {
      this.gateway.emitNotification(updated.userId, updated);
    }
  }

  /**
   * Get user IDs of all collaborators for an inbox (direct users + team members).
   */
  async getInboxCollaboratorUserIds(inboxId: string): Promise<string[]> {
    const results = await this.notificationRepo.query(
      `SELECT DISTINCT u.id
       FROM inbox_collaborators ic
       LEFT JOIN users u ON ic.type = 'user' AND ic.reference_id = u.id
       LEFT JOIN team_members tm ON ic.type = 'team' AND tm.team_id = ic.reference_id
       LEFT JOIN users tu ON tu.id = tm.user_id
       WHERE ic.inbox_id = $1
       UNION
       SELECT DISTINCT tm2.user_id as id
       FROM inbox_collaborators ic2
       JOIN team_members tm2 ON ic2.type = 'team' AND tm2.team_id = ic2.reference_id
       WHERE ic2.inbox_id = $1`,
      [inboxId],
    );
    return results.map((r: { id: string }) => r.id).filter(Boolean);
  }

  /**
   * Get admin/owner user IDs for a tenant.
   */
  async getTenantAdminUserIds(tenantId: string): Promise<string[]> {
    const results = await this.notificationRepo.query(
      `SELECT u.id FROM users u
       JOIN tenant_users tu ON tu.user_id = u.id
       WHERE tu.tenant_id = $1 AND tu.role IN ('admin', 'owner')`,
      [tenantId],
    );
    return results.map((r: { id: string }) => r.id);
  }
}
