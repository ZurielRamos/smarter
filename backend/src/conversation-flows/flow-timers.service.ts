import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FlowTimer, type FlowTimerStatus } from './flow-timer.entity';
import type { FlowRunResult } from './conversation-flow.engine';

/** Tiempo que un servidor «reserva» un temporizador mientras lo procesa. */
const LOCK_SECONDS = 120;
/** Un temporizador cuyo servidor murió se reintenta como máximo estas veces. */
const MAX_ATTEMPTS = 3;

/**
 * Persistencia de los temporizadores de flujos. Todo pasa por Postgres para
 * que sea seguro con varios servidores y sobreviva a reinicios.
 */
@Injectable()
export class FlowTimersService {
  constructor(
    @InjectRepository(FlowTimer)
    private readonly repo: Repository<FlowTimer>,
  ) {}

  /**
   * Cambió la espera de la conversación: se cancelan los temporizadores
   * pendientes y se guardan los nuevos (si los hay), en una transacción.
   */
  async replace(
    tenantId: string,
    conversationId: string,
    timers: FlowRunResult['timers'],
  ): Promise<void> {
    await this.repo.manager.transaction(async (em) => {
      await em.update(
        FlowTimer,
        { conversationId, status: In(['pending', 'running']) },
        { status: 'cancelled' },
      );
      if (timers.length) {
        await em.insert(
          FlowTimer,
          timers.map((t) => ({
            tenantId,
            conversationId,
            flowId: t.flowId,
            nodeId: t.nodeId,
            kind: t.kind,
            step: t.step,
            token: t.token,
            fireAt: t.fireAt,
            status: 'pending' as const,
          })),
        );
      }
    });
  }

  async cancelForConversation(conversationId: string): Promise<void> {
    await this.repo.update(
      { conversationId, status: 'pending' },
      { status: 'cancelled' },
    );
  }

  /**
   * Toma hasta `limit` temporizadores vencidos y los marca como en proceso.
   * FOR UPDATE SKIP LOCKED: dos servidores nunca toman el mismo. También
   * recupera los que quedaron «en proceso» porque su servidor se cayó.
   */
  async claimDue(limit = 50): Promise<FlowTimer[]> {
    const rows: Record<string, unknown>[] = await this.repo.query(
      `UPDATE flow_timers
          SET status = 'running',
              locked_until = now() + ($2 || ' seconds')::interval,
              attempts = attempts + 1
        WHERE id IN (
          SELECT id FROM flow_timers
           WHERE (status = 'pending' AND fire_at <= now())
              OR (status = 'running' AND locked_until < now() AND attempts < $3)
           ORDER BY fire_at
           LIMIT $1
           FOR UPDATE SKIP LOCKED
        )
      RETURNING *`,
      [limit, String(LOCK_SECONDS), MAX_ATTEMPTS],
    );
    // UPDATE … RETURNING devuelve [filas, cantidad] en el driver de Postgres.
    const list = (Array.isArray(rows[0]) ? rows[0] : rows) as Record<
      string,
      unknown
    >[];
    return list.map((r) =>
      this.repo.create({
        id: r.id as string,
        tenantId: r.tenant_id as string,
        conversationId: r.conversation_id as string,
        flowId: r.flow_id as string,
        nodeId: r.node_id as string,
        kind: r.kind as FlowTimer['kind'],
        step: Number(r.step),
        token: r.token as string,
        fireAt: new Date(r.fire_at as string),
        status: r.status as FlowTimerStatus,
        attempts: Number(r.attempts),
        createdAt: new Date(r.created_at as string),
      }),
    );
  }

  /** Cierra un temporizador. Si mientras tanto lo cancelaron, no lo reabre. */
  async finish(
    id: string,
    status: Extract<FlowTimerStatus, 'done' | 'cancelled' | 'failed'>,
    error?: string,
  ): Promise<void> {
    await this.repo.update(
      { id, status: 'running' },
      {
        status,
        firedAt: new Date(),
        lockedUntil: null,
        error: error ? error.slice(0, 1000) : null,
      },
    );
  }

  /** Temporizadores atascados que agotaron los intentos: se dan por fallidos. */
  async failStale(): Promise<void> {
    await this.repo.query(
      `UPDATE flow_timers SET status = 'failed', error = 'El servidor que lo procesaba no respondió'
        WHERE status = 'running' AND locked_until < now() AND attempts >= $1`,
      [MAX_ATTEMPTS],
    );
  }
}
