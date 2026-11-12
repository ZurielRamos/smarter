import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { FlowTimersService } from '../conversation-flows/flow-timers.service';
import { ChatsService } from './chats.service';

/** Cada cuánto se buscan temporizadores vencidos. */
const TICK_MS = 15_000;
/** Máximo por vuelta: si hay más, la siguiente vuelta sigue. */
const BATCH = 50;

/**
 * Ejecuta los temporizadores de flujos («Si no responde») que vencieron.
 *
 * Puede correr en todos los servidores a la vez: la toma es con FOR UPDATE
 * SKIP LOCKED, así que cada temporizador lo procesa uno solo. Para apagarlo en
 * un servidor: FLOW_TIMERS_ENABLED=false.
 */
@Injectable()
export class FlowTimersWorker {
  private readonly logger = new Logger(FlowTimersWorker.name);
  private readonly enabled: boolean;
  private running = false;

  constructor(
    private readonly timers: FlowTimersService,
    private readonly chats: ChatsService,
    config: ConfigService,
  ) {
    this.enabled =
      config.get<string>('FLOW_TIMERS_ENABLED', 'true') !== 'false';
  }

  @Interval(TICK_MS)
  async tick(): Promise<void> {
    // Una vuelta lenta no debe solaparse con la siguiente en el mismo proceso.
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      await this.timers.failStale();
      const due = await this.timers.claimDue(BATCH);
      for (const timer of due) {
        try {
          const outcome = await this.chats.fireFlowTimer(timer);
          await this.timers.finish(timer.id, outcome);
        } catch (err) {
          // Sin reintento a ciegas: podría duplicar un mensaje ya enviado.
          const message = (err as Error)?.message || String(err);
          this.logger.warn(`Temporizador ${timer.id} falló: ${message}`);
          await this.timers.finish(timer.id, 'failed', message).catch(() => {});
        }
      }
    } catch (err) {
      this.logger.error(
        `Error revisando temporizadores de flujos: ${(err as Error)?.message || err}`,
      );
    } finally {
      this.running = false;
    }
  }
}
