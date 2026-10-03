import { Injectable, Logger } from '@nestjs/common';
import { FlowSubmissionsService } from './flow-submissions.service';

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
 * Procesa la lógica de negocio de un Flow a partir del cuerpo descifrado.
 *
 * Aquí es donde conectas tus datos: cargar opciones dinámicas en INIT,
 * validar y persistir lo recibido en cada data_exchange, y construir la
 * pantalla siguiente. El routing de pantallas vive en el JSON del Flow;
 * este servicio solo decide a cuál ir y con qué datos.
 */
@Injectable()
export class FlowDataService {
  private readonly logger = new Logger(FlowDataService.name);

  constructor(private readonly submissions: FlowSubmissionsService) {}

  /**
   * Versión del data_api_version del Flow. Debe coincidir con la propiedad
   * "data_api_version" declarada en el JSON del Flow (p. ej. "3.0").
   */
  private readonly dataApiVersion = '3.0';

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
        return {
          version: this.dataApiVersion,
          data: { acknowledged: true },
        };
    }
  }

  /**
   * Health check. Meta espera { data: { status: "active" } }.
   */
  private handlePing(): FlowResponseBody {
    return {
      version: this.dataApiVersion,
      data: { status: 'active' },
    };
  }

  /**
   * Primera carga del Flow. Devuelve la pantalla inicial con los datos
   * dinámicos que necesite (p. ej. opciones de un dropdown).
   */
  private async handleInit(body: FlowRequestBody): Promise<FlowResponseBody> {
    this.logger.log(`[Flow INIT] flow_token=${body.flow_token}`);

    return {
      version: this.dataApiVersion,
      screen: 'SCREEN_INTRO',
      data: {
        // Ejemplo: opciones dinámicas para el segmento B2B.
        segmentos: [
          { id: 'flota_carretera', title: 'Flota de carretera' },
          { id: 'fuera_carretera', title: 'Fuera de carretera' },
          { id: 'manufactura', title: 'Manufactura' },
        ],
      },
    };
  }

  /**
   * El usuario volvió atrás. Normalmente basta con reconstruir los datos
   * de la pantalla anterior.
   */
  private async handleBack(body: FlowRequestBody): Promise<FlowResponseBody> {
    this.logger.log(`[Flow BACK] screen=${body.screen}`);
    return {
      version: this.dataApiVersion,
      screen: body.screen,
      data: body.data || {},
    };
  }

  /**
   * El usuario envió datos desde una pantalla. Aquí decides la pantalla
   * siguiente y qué datos pasarle, o terminas el Flow con SUCCESS.
   *
   * `body.screen` es la pantalla que originó el envío y `body.data` los
   * valores del formulario de esa pantalla.
   */
  private async handleDataExchange(
    body: FlowRequestBody,
  ): Promise<FlowResponseBody> {
    const screen = body.screen;
    const data = body.data || {};
    this.logger.log(
      `[Flow data_exchange] screen=${screen} data=${JSON.stringify(data)}`,
    );

    // Persistimos los datos de CADA pantalla (no solo la final) para no
    // perder información si el usuario abandona a mitad del Flow.
    if (screen && body.flow_token) {
      await this.submissions
        .recordScreen({ flowToken: body.flow_token, screen, data, completed: false })
        .catch((err) =>
          this.logger.warn(`[Flow] No se pudo guardar la pantalla ${screen}: ${err.message}`),
        );
    }

    switch (screen) {
      case 'SCREEN_INTRO': {
        // Según el segmento elegido, enruta a la pantalla correspondiente.
        const next = this.resolveNextScreen(data.segmento);
        return {
          version: this.dataApiVersion,
          screen: next,
          data: {},
        };
      }

      // Pantalla final de datos: aquí persistirías la encuesta/lead.
      case 'SCREEN_DEMOGRAFIA': {
        await this.persistSubmission(body.flow_token, data);
        return {
          version: this.dataApiVersion,
          screen: 'SUCCESS',
          data: {
            extension_message_response: {
              params: {
                flow_token: body.flow_token,
                // Datos que quieras recibir luego en el webhook de mensajes.
                completed: true,
              },
            },
          },
        };
      }

      default: {
        // Por defecto, confirma recepción sin cambiar de pantalla.
        return {
          version: this.dataApiVersion,
          data: { acknowledged: true },
        };
      }
    }
  }

  /**
   * Mapea el segmento B2B seleccionado a la siguiente pantalla del Flow.
   * Ajusta los valores a los IDs reales de tu routing model.
   */
  private resolveNextScreen(segmento?: string): string {
    switch (segmento) {
      case 'flota_carretera':
      case 'fuera_carretera':
        return 'SCREEN_COMERCIAL';
      case 'manufactura':
        return 'SCREEN_INGENIERIA';
      default:
        return 'SCREEN_COMERCIAL';
    }
  }

  /**
   * Marca la submission como completada con los datos de la pantalla final.
   * La submission ya debe existir (creada al enviar el Flow o en la primera
   * pantalla); aquí solo se cierra con status 'completed'.
   */
  private async persistSubmission(
    flowToken: string | undefined,
    data: Record<string, any>,
  ): Promise<void> {
    if (!flowToken) {
      this.logger.warn('[Flow SUBMIT] sin flow_token, no se puede persistir');
      return;
    }
    await this.submissions.recordScreen({
      flowToken,
      screen: 'SUCCESS',
      data,
      completed: true,
    });
  }
}
