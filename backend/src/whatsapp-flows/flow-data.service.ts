import { Injectable, Logger } from '@nestjs/common';
import { FlowSubmissionsService } from './flow-submissions.service';
import { FlowSyncService } from './flow-sync.service';
import { WhatsAppFlow } from './entities/whatsapp-flow.entity';

/**
 * Cuerpo ya descifrado de una petición del Flow.
 * Meta documenta estas acciones:
 *   - ping           -> health check (responder con status active)
 *   - INIT           -> primera carga del Flow (si usa endpoint en INIT)
 *   - data_exchange  -> el usuario avanzó/envió datos de una pantalla
 *   - BACK           -> el usuario volvió a la pantalla anterior
 */
export interface FlowRequestBody {
  version: string;
  action: 'ping' | 'INIT' | 'BACK' | 'data_exchange';
  screen?: string;
  data?: Record<string, any>;
  flow_token?: string;
}

/**
 * Respuesta que el endpoint devuelve (en claro, antes de cifrar).
 * Para navegar: { screen, data }.
 * Para terminar: { screen: 'SUCCESS', data: { extension_message_response: ... } }.
 */
export interface FlowResponseBody {
  version: string;
  screen?: string;
  data?: Record<string, any>;
}

/**
 * Procesa la lógica de negocio de CUALQUIER WhatsApp Flow de forma genérica.
 *
 * El enrutamiento NO está hardcodeado: se deriva del `routing_model` del JSON
 * del propio Flow (almacenado en WhatsAppFlow.flowJson), que se resuelve a
 * partir del flow_token de la petición. Así el mismo endpoint sirve para todos
 * los Flows del sistema, presentes y futuros, sin tocar código.
 */
@Injectable()
export class FlowDataService {
  private readonly logger = new Logger(FlowDataService.name);

  constructor(
    private readonly submissions: FlowSubmissionsService,
    private readonly flowSync: FlowSyncService,
  ) {}

  /**
   * Resuelve la definición del Flow (con su flowJson) a partir del token.
   * Si está en BD pero sin JSON cacheado, lo sincroniza desde Meta. Esto hace
   * el enrutamiento totalmente dinámico para cualquier Flow.
   */
  private async resolveFlow(flowToken?: string): Promise<WhatsAppFlow | null> {
    if (!flowToken) return null;
    let flow = await this.submissions.resolveFlowByToken(flowToken);

    // Si no hay JSON cacheado, intentar sincronizarlo desde Meta.
    if (flow && !flow.flowJson && flow.metaFlowId) {
      const synced = await this.flowSync
        .ensureFlowDefinition(flow.tenantId, flow.metaFlowId, flow.inboxId)
        .catch((err) => {
          this.logger.warn(`[Flow] No se pudo sincronizar la definición: ${err.message}`);
          return null;
        });
      if (synced) flow = synced;
    }
    return flow;
  }

  /**
   * Versión por defecto del data_api_version. Si el Flow define su propia
   * data_api_version en el JSON, se usa esa.
   */
  private readonly defaultDataApiVersion = '3.0';

  async handle(body: FlowRequestBody): Promise<FlowResponseBody> {
    switch (body.action) {
      case 'ping':
        return this.handlePing();

      case 'INIT':
        return this.handleInit(body);

      case 'BACK':
        return this.handleBack(body);

      case 'data_exchange':
        return this.handleDataExchange(body);

      default:
        this.logger.warn(`Acción de Flow no soportada: ${body.action}`);
        return { version: this.defaultDataApiVersion, data: { acknowledged: true } };
    }
  }

  /**
   * Health check. Meta espera { data: { status: "active" } }.
   */
  private handlePing(): FlowResponseBody {
    return { version: this.defaultDataApiVersion, data: { status: 'active' } };
  }

  /**
   * Primera carga del Flow. Devuelve la pantalla de entrada declarada en el
   * routing del Flow (la primera clave del routing_model). Las opciones de las
   * pantallas ya viven en el JSON del Flow, no se inyectan aquí.
   */
  private async handleInit(body: FlowRequestBody): Promise<FlowResponseBody> {
    this.logger.log(`[Flow INIT] flow_token=${body.flow_token}`);
    const flow = await this.resolveFlow(body.flow_token);
    const version = this.getDataApiVersion(flow?.flowJson);
    const entryScreen =
      flow?.entryScreen || this.getEntryScreen(flow?.flowJson) || body.screen;

    return { version, screen: entryScreen, data: {} };
  }

  /**
   * El usuario volvió atrás. Reconstruye la pantalla indicada por Meta.
   */
  private async handleBack(body: FlowRequestBody): Promise<FlowResponseBody> {
    this.logger.log(`[Flow BACK] screen=${body.screen}`);
    const flow = await this.resolveFlow(body.flow_token);
    return {
      version: this.getDataApiVersion(flow?.flowJson),
      screen: body.screen,
      data: body.data || {},
    };
  }

  /**
   * El usuario envió datos de una pantalla. Se persiste lo recibido y se avanza
   * a la siguiente pantalla según el routing_model del Flow. Si la pantalla es
   * terminal (sin siguiente), se completa el Flow.
   */
  private async handleDataExchange(body: FlowRequestBody): Promise<FlowResponseBody> {
    const screen = body.screen;
    const data = body.data || {};
    this.logger.log(`[Flow data_exchange] screen=${screen} keys=${Object.keys(data).join(',')}`);

    // Resolver el Flow (y su routing) a partir del token.
    const flow = await this.resolveFlow(body.flow_token);
    const version = this.getDataApiVersion(flow?.flowJson);
    const routing = this.getRoutingModel(flow?.flowJson);

    // Persistir SIEMPRE los datos de la pantalla (aunque no haya definición
    // del Flow en BD), para no perder respuestas.
    const isTerminal = this.isTerminalScreen(flow?.flowJson, routing, screen);
    if (screen && body.flow_token) {
      await this.submissions
        .recordScreen({ flowToken: body.flow_token, screen, data, completed: isTerminal })
        .catch((err) =>
          this.logger.warn(`[Flow] No se pudo guardar la pantalla ${screen}: ${err.message}`),
        );
    }

    // Determinar la siguiente pantalla desde el routing del Flow.
    const next = this.getNextScreen(routing, screen);

    if (!next) {
      // Pantalla terminal (o sin routing disponible): completar el Flow.
      return {
        version,
        screen: 'SUCCESS',
        data: {
          extension_message_response: {
            params: { flow_token: body.flow_token, completed: true },
          },
        },
      };
    }

    // Avanzar a la siguiente pantalla. Los datos de la pantalla ya están en el JSON.
    return { version, screen: next, data: {} };
  }

  // ---- Helpers de lectura del JSON del Flow ----

  /** data_api_version declarada en el JSON, o la de por defecto. */
  private getDataApiVersion(flowJson?: Record<string, any> | null): string {
    return flowJson?.data_api_version || this.defaultDataApiVersion;
  }

  /** routing_model del Flow como mapa pantalla -> [siguientes]. */
  private getRoutingModel(
    flowJson?: Record<string, any> | null,
  ): Record<string, string[]> | null {
    const rm = flowJson?.routing_model;
    if (rm && typeof rm === 'object') return rm as Record<string, string[]>;
    return null;
  }

  /** Primera pantalla del routing (pantalla de entrada). */
  private getEntryScreen(flowJson?: Record<string, any> | null): string | null {
    const rm = this.getRoutingModel(flowJson);
    if (rm) {
      const keys = Object.keys(rm);
      if (keys.length > 0) return keys[0];
    }
    // Fallback: primera pantalla declarada en screens[].
    const screens = flowJson?.screens;
    if (Array.isArray(screens) && screens[0]?.id) return screens[0].id;
    return null;
  }

  /**
   * Siguiente pantalla a partir del routing_model. Para un Flow lineal, cada
   * pantalla tiene exactamente un destino. Si hay varios destinos posibles
   * (Flow ramificado), se toma el primero; para ramificación por respuesta se
   * puede extender aquí leyendo `data`.
   */
  private getNextScreen(
    routing: Record<string, string[]> | null,
    screen?: string,
  ): string | null {
    if (!routing || !screen) return null;
    const targets = routing[screen];
    if (!Array.isArray(targets) || targets.length === 0) return null;
    return targets[0];
  }

  /**
   * Determina si la pantalla es terminal: no tiene destinos en el routing, o
   * su definición en screens[] está marcada como terminal/success.
   */
  private isTerminalScreen(
    flowJson: Record<string, any> | null | undefined,
    routing: Record<string, string[]> | null,
    screen?: string,
  ): boolean {
    if (!screen) return false;
    if (routing && Array.isArray(routing[screen]) && routing[screen].length === 0) {
      return true;
    }
    const screens = flowJson?.screens;
    if (Array.isArray(screens)) {
      const def = screens.find((s: any) => s?.id === screen);
      if (def?.terminal === true || def?.success === true) return true;
    }
    // Si no hay routing disponible no podemos afirmar que sea terminal.
    return false;
  }
}
