import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { SyncTombstone } from './sync-tombstone.entity';

export const SYNC_MAX_LIMIT = 500;
export const SYNC_DEFAULT_LIMIT = 200;

export type SyncConversationDto = ReturnType<ChatsSyncService['toConversationDto']>;
export type SyncMessageDto = ReturnType<ChatsSyncService['toMessageDto']>;

export type SyncConversationsResult = {
  data: SyncConversationDto[];
  /** Conversaciones eliminadas y conversaciones vaciadas desde `since`. */
  deleted: Array<{ id: string; kind: SyncTombstone['kind'] }>;
  /** Valor a enviar como `since` en la siguiente llamada. */
  cursor: string;
  hasMore: boolean;
};

export type SyncMessagesResult = {
  data: SyncMessageDto[];
  cursor: string;
  hasMore: boolean;
};

/**
 * Sincronización incremental para clientes offline (app móvil).
 *
 * El cursor es un instante (epoch ms) de `updated_at`. Las llamadas son
 * idempotentes: devolver una fila de más no daña al cliente, que hace upsert.
 * Por eso el cliente debe restar un pequeño margen al cursor guardado, para no
 * perder filas de transacciones que confirmaron después de otras posteriores.
 *
 * Supuesto: Postgres y Node trabajan en UTC (las columnas `timestamp` sin zona
 * de `clients` se comparan contra el mismo instante).
 */
@Injectable()
export class ChatsSyncService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(SyncTombstone)
    private readonly tombstoneRepo: Repository<SyncTombstone>,
  ) {}

  private parseSince(raw?: string): Date | null {
    if (raw === undefined || raw === '') return null;
    const ms = Number(raw);
    if (!Number.isFinite(ms) || ms < 0) {
      throw new BadRequestException('Cursor inválido');
    }
    return new Date(ms);
  }

  private parseLimit(raw?: string): number {
    const limit = raw ? parseInt(raw, 10) : SYNC_DEFAULT_LIMIT;
    if (!Number.isFinite(limit) || limit < 1) return SYNC_DEFAULT_LIMIT;
    return Math.min(limit, SYNC_MAX_LIMIT);
  }

  /** Hora de la base de datos: evita desfases con el reloj del servidor de la app. */
  private async databaseNow(): Promise<number> {
    const rows = await this.conversationRepo.query(
      `SELECT (EXTRACT(EPOCH FROM now()) * 1000)::bigint AS now`,
    );
    return Number(rows[0].now);
  }

  /**
   * Sin `since` solo devuelve el cursor inicial: la primera sincronización de
   * un cliente baja las conversaciones recientes por el listado paginado y
   * después continúa desde este cursor.
   */
  async syncConversations(
    tenantId: string,
    sinceRaw?: string,
    limitRaw?: string,
  ): Promise<SyncConversationsResult> {
    const since = this.parseSince(sinceRaw);
    if (!since) {
      return { data: [], deleted: [], cursor: String(await this.databaseNow()), hasMore: false };
    }
    const limit = this.parseLimit(limitRaw);

    const base = () =>
      this.conversationRepo
        .createQueryBuilder('c')
        .innerJoinAndSelect('c.inbox', 'i')
        .leftJoinAndSelect('c.record', 'r')
        .where('i.tenant_id = :tenantId', { tenantId });

    const [changed, recordChanged, tombstones] = await Promise.all([
      base()
        .andWhere('c.updated_at > :since', { since })
        .orderBy('c.updated_at', 'ASC')
        .addOrderBy('c.id', 'ASC')
        .take(limit)
        .getMany(),
      // Cambios en el contacto (asignación, nombre, avatar) también afectan a la conversación.
      // `clients.updated_at` es `timestamp` sin zona: se compara en SQL (interpretado en la
      // zona de la sesión, igual que al escribirse) y no con un Date de JS, que depende del TZ de Node.
      base()
        .andWhere('r.updated_at > CAST(:sinceIso AS timestamptz)', { sinceIso: since.toISOString() })
        .orderBy('r.updated_at', 'ASC')
        .addOrderBy('c.id', 'ASC')
        .take(limit)
        .getMany(),
      this.tombstoneRepo.find({
        where: { tenantId, createdAt: MoreThan(since) },
        order: { createdAt: 'ASC', id: 'ASC' },
        take: limit,
      }),
    ]);

    const byId = new Map<string, Conversation>();
    for (const c of [...changed, ...recordChanged]) byId.set(c.id, c);

    // Cursor: si algún flujo llenó su límite, hay más y solo podemos avanzar
    // hasta donde llegó el flujo más atrasado. Si no, hasta lo más reciente visto.
    const limited: number[] = [];
    const seen: number[] = [];
    const track = (times: number[]) => {
      if (times.length === 0) return;
      seen.push(times[times.length - 1]);
      if (times.length === limit) limited.push(times[times.length - 1]);
    };
    track(changed.map((c) => c.updatedAt.getTime()));
    track(await this.recordUpdateTimes(recordChanged));
    track(tombstones.map((t) => t.createdAt.getTime()));

    const hasMore = limited.length > 0;
    const cursor = hasMore
      ? Math.min(...limited)
      : seen.length > 0
        ? Math.max(...seen)
        : since.getTime();

    return {
      data: [...byId.values()].map((c) => this.toConversationDto(c)),
      deleted: tombstones.map((t) => ({ id: t.entityId, kind: t.kind })),
      cursor: String(cursor),
      hasMore,
    };
  }

  /** Instantes (epoch ms) de `clients.updated_at`, en el mismo orden que las conversaciones recibidas. */
  private async recordUpdateTimes(conversations: Conversation[]): Promise<number[]> {
    const ids = conversations.map((c) => c.recordId).filter((id): id is string => !!id);
    if (ids.length === 0) return [];
    const rows: Array<{ id: string; ms: string }> = await this.conversationRepo.query(
      `SELECT id, (EXTRACT(EPOCH FROM updated_at::timestamptz) * 1000)::bigint AS ms
       FROM clients WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    const byId = new Map(rows.map((r) => [r.id, Number(r.ms)]));
    return conversations.map((c) => byId.get(c.recordId as string) ?? 0);
  }

  async syncMessages(
    tenantId: string,
    sinceRaw?: string,
    limitRaw?: string,
  ): Promise<SyncMessagesResult> {
    const since = this.parseSince(sinceRaw);
    if (!since) {
      return { data: [], cursor: String(await this.databaseNow()), hasMore: false };
    }
    const limit = this.parseLimit(limitRaw);

    const messages = await this.messageRepo
      .createQueryBuilder('m')
      .innerJoin('m.conversation', 'c')
      .innerJoin('c.inbox', 'i')
      .leftJoin('m.sender', 's')
      .addSelect(['s.id', 's.name'])
      .where('i.tenant_id = :tenantId', { tenantId })
      .andWhere('m.updated_at > :since', { since })
      .orderBy('m.updated_at', 'ASC')
      .addOrderBy('m.id', 'ASC')
      .take(limit)
      .getMany();

    const hasMore = messages.length === limit;
    const last = messages[messages.length - 1];
    return {
      data: messages.map((m) => this.toMessageDto(m)),
      cursor: String(last ? last.updatedAt.getTime() : since.getTime()),
      hasMore,
    };
  }

  /** Solo los campos que usa el cliente: nada de tokens de inbox ni datos del CRM. */
  toConversationDto(c: Conversation) {
    return {
      id: c.id,
      inboxId: c.inboxId,
      inbox: c.inbox ? { id: c.inbox.id, name: c.inbox.name, channel: c.inbox.channel } : null,
      recordId: c.recordId,
      record: c.record
        ? {
            id: c.record.id,
            fullName: c.record.fullName ?? null,
            firstName: c.record.firstName ?? null,
            lastName: c.record.lastName ?? null,
            phone: c.record.phone ?? null,
            avatarUrl: c.record.avatarUrl ?? null,
            assignedTo: c.record.assignedTo ?? null,
          }
        : null,
      contactId: c.contactId,
      contactName: c.contactName,
      contactAvatar: c.contactAvatar,
      status: c.status,
      lastMessage: c.lastMessage,
      lastMessageAt: c.lastMessageAt,
      unreadCount: c.unreadCount,
      botStatus: c.botStatus,
      labelIds: c.labelIds ?? [],
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  toMessageDto(m: Message) {
    return {
      id: m.id,
      conversationId: m.conversationId,
      clientMessageId: m.clientMessageId,
      direction: m.direction,
      messageType: m.messageType,
      content: m.content,
      mediaUrl: m.mediaUrl,
      mediaMimeType: m.mediaMimeType,
      externalId: m.externalId,
      replyToExternalId: m.replyToExternalId,
      status: m.status,
      source: m.source,
      senderId: m.senderId,
      sender: m.sender ? { id: m.sender.id, name: m.sender.name } : null,
      interactive: m.interactive,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }
}
