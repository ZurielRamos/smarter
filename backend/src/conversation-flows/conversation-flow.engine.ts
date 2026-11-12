import { Injectable, Optional } from '@nestjs/common';
import {
  ConversationFlow,
  ConversationFlowState,
  FlowButton,
  FlowNode,
  FlowNodeData,
  FlowHeaderMedia,
} from './conversation-flow.entity';
import { isHttpUrl, normalizePhone } from './flow-buttons.util';
import {
  evaluateBranch,
  normalizeText,
  type ConditionEnv,
} from './flow-conditions.util';
import {
  DEFAULT_INPUT_RETRIES,
  MAX_INPUT_RETRIES_LIMIT,
  defaultInputError,
  formatChoices,
  mediaKindOf,
  readLocationInput,
  readMediaInput,
  validateInputValue,
  type FlowInputMedia,
} from './flow-input.util';
import { FlowAiService } from './flow-ai.service';
import {
  newWaitToken,
  planTimers,
  type PlannedTimer,
} from './flow-timeout.util';
import type { FlowTimerKind } from './flow-timer.entity';
import {
  DEFAULT_NO_MATCH_RETRIES,
  MAX_NO_MATCH_RETRIES,
  matchReplyOption,
} from './flow-reply-match.util';
import { matchChoice } from './flow-input.util';
import {
  AGENT_DEFAULT_TURNS,
  AGENT_MAX_TURNS,
  pushHistory,
  type AgentTurn,
} from './flow-agent.util';

type AgentHistory = { role: 'user' | 'assistant'; content: string }[];

/** Botón de enlace o llamada ya resuelto (variables sustituidas) para enviar. */
export interface FlowOutgoingAction {
  type: 'url' | 'call';
  title: string;
  url?: string;
  phone?: string;
  /** Id del botón en el nodo; identifica la salida «Al hacer clic». */
  buttonId?: string;
  /** Registrar los clics con un enlace corto propio (solo botones de enlace). */
  track?: boolean;
}

/** Mensaje que el flujo quiere enviar al contacto. */
export interface FlowOutgoingMessage {
  text: string;
  header?: string;
  /** Encabezado multimedia (excluye `header` de texto) */
  headerMedia?: FlowHeaderMedia;
  footer?: string;
  /** Botones de respuesta (id = payload completo que devuelve el canal) */
  buttons?: FlowButton[];
  /** Botones de enlace / llamada (no ramifican por sí mismos) */
  actions?: FlowOutgoingAction[];
  /** Nodo que generó el mensaje; necesario para asociar los clics a su salida. */
  source?: { flowId: string; nodeId: string };
}

/** Efectos sobre la conversación que el llamador debe aplicar. */
export interface FlowEffects {
  handoff: boolean;
  resolve: boolean;
  addLabelIds: string[];
  removeLabelIds: string[];
}

export interface FlowRunResult {
  /** true si el flujo atendió el mensaje (el bot no debe responder). */
  handled: boolean;
  messages: FlowOutgoingMessage[];
  /** Estado nuevo; null si el flujo terminó. */
  state: ConversationFlowState | null;
  /** Variables de la conversación tras la ejecución (persisten entre flujos). */
  variables: Record<string, string>;
  effects: FlowEffects;
  /** Flujos que se iniciaron en esta ejecución (para métricas). */
  startedFlowIds: string[];
  /**
   * Campos del CRM que los nodos Entrada quieren guardar en el contacto
   * (clave del campo → valor). Los aplica ChatsService.
   */
  contactUpdates: Record<string, string>;
  /**
   * Temporizadores a armar porque el flujo quedó esperando con una ficha nueva
   * («Si no responde»). ChatsService los guarda y cancela los anteriores.
   */
  timers: (PlannedTimer & { flowId: string; nodeId: string; token: string })[];
  /** Recordatorio con la ventana de 24 h cerrada: plantilla a enviar en su lugar. */
  templateFallback?: {
    name: string;
    language: string;
    params: string[];
    /** Texto del recordatorio (se guarda como contenido del mensaje enviado) */
    text: string;
  };
}

export interface FlowInput {
  text: string | null;
  /** id del botón pulsado (WhatsApp button_reply/list_reply, quick_reply payload) */
  payload?: string | null;
  /** Archivo o ubicación del mensaje (para entradas de archivo, ubicación o notas de voz) */
  media?: FlowInputMedia | null;
}

export interface FlowContext {
  contactName?: string | null;
  /**
   * Campos del CRM del contacto (sistema y personalizados) ya formateados como
   * texto, disponibles como {{clave}}. Vacío si la conversación no tiene un
   * contacto vinculado.
   */
  contact?: Record<string, string>;
  /**
   * Datos de la conversación para las reglas del nodo Condición. Todos son
   * opcionales: lo que falta se evalúa como vacío o cero.
   */
  lastMessage?: string;
  channel?: string;
  inboxId?: string;
  labelIds?: string[];
  conversationStatus?: string;
  /** Mensajes que ha enviado el contacto en la conversación. */
  inboundCount?: number;
  hasContact?: boolean;
  /** Reloj y azar inyectables para poder probar las reglas de hora y reparto. */
  now?: Date;
  random?: () => number;
  /**
   * true si el canal es WhatsApp Cloud API nativo (no puente SendPulse ni
   * Evolution). Solo ahí aplica la paginación «Más opciones»: en el resto las
   * opciones se muestran completas como texto numerado o respuestas rápidas.
   */
  whatsappCloud?: boolean;
}

/** WhatsApp admite hasta 3 botones de respuesta por mensaje. */
const WA_MAX_REPLY_BUTTONS = 3;
/** Botones de opciones por página cuando se pagina (+ «Más opciones» = 3). */
const PAGE_SIZE = 2;
/** Id reservado del botón «Más opciones»; lleva el número de página: __more:<n> */
const MORE_PREFIX = '__more:';
const MORE_TITLE = 'Más opciones';

export type FlowLoader = (flowId: string) => Promise<ConversationFlow | null>;

/** Prefijo de los ids de botón enviados a los canales: cf:<flowId>:<nodeId>:<buttonId> */
const PAYLOAD_PREFIX = 'cf:';
/** Límite de nodos ejecutados por turno, evita bucles infinitos entre flujos. */
const MAX_STEPS_PER_TURN = 60;

export function buildButtonPayload(
  flowId: string,
  nodeId: string,
  buttonId: string,
): string {
  return `${PAYLOAD_PREFIX}${flowId}:${nodeId}:${buttonId}`;
}

export function parseButtonPayload(
  payload: string | null | undefined,
): { flowId: string; nodeId: string; buttonId: string } | null {
  if (!payload || !payload.startsWith(PAYLOAD_PREFIX)) return null;
  const parts = payload.slice(PAYLOAD_PREFIX.length).split(':');
  if (parts.length < 3) return null;
  const [flowId, nodeId, ...rest] = parts;
  const buttonId = rest.join(':');
  if (!flowId || !nodeId || !buttonId) return null;
  return { flowId, nodeId, buttonId };
}

/**
 * Motor de ejecución de flujos conversacionales (grafo de nodos).
 *
 * Es puro respecto al envío: no habla con los canales ni con la BD. Recorre el
 * grafo y devuelve los mensajes a enviar, el estado nuevo y los efectos
 * (etiquetas, transferir a humano, resolver). ChatsService aplica el resultado.
 */
@Injectable()
export class ConversationFlowEngine {
  /** La IA es opcional: sin ella las entradas se validan solo con reglas. */
  constructor(@Optional() private readonly ai?: FlowAiService) {}

  /** Inicia un flujo desde su nodo Inicio. */
  async start(
    flow: ConversationFlow,
    variables: Record<string, string>,
    loader: FlowLoader,
    context: FlowContext,
  ): Promise<FlowRunResult> {
    const result = await this.startInner(flow, variables, loader, context);
    await this.armTimers(result, loader, undefined, context);
    return result;
  }

  private async startInner(
    flow: ConversationFlow,
    variables: Record<string, string>,
    loader: FlowLoader,
    context: FlowContext,
  ): Promise<FlowRunResult> {
    const result = this.emptyResult({ ...variables });
    result.handled = true;
    result.startedFlowIds.push(flow.id);
    const startNode = flow.nodes.find((n) => n.type === 'start');
    if (!startNode) return result;
    await this.runFrom(
      flow,
      startNode.id,
      result.variables,
      loader,
      context,
      result,
    );
    return result;
  }

  /**
   * Continúa un flujo a partir de la respuesta del contacto.
   *
   * - Si `input.payload` es un botón de un flujo (aunque el flujo ya hubiera
   *   terminado), continúa desde la salida de ese botón.
   * - Si hay estado activo, valida la respuesta contra el nodo en espera.
   * - Devuelve handled=false cuando el flujo no puede atender el mensaje y debe
   *   pasar al bot / agente.
   */
  async resume(
    state: ConversationFlowState | null,
    currentVariables: Record<string, string>,
    input: FlowInput,
    loader: FlowLoader,
    context: FlowContext,
  ): Promise<FlowRunResult> {
    const result = await this.resumeInner(
      state,
      currentVariables,
      input,
      loader,
      context,
    );
    await this.armTimers(result, loader, state?.token, context);
    return result;
  }

  private async resumeInner(
    state: ConversationFlowState | null,
    currentVariables: Record<string, string>,
    input: FlowInput,
    loader: FlowLoader,
    context: FlowContext,
  ): Promise<FlowRunResult> {
    const result = this.emptyResult({ ...currentVariables });
    const variables = result.variables;
    // Por defecto se conserva el estado actual (si el flujo no atiende el mensaje,
    // el llamador decide qué hacer con él).
    result.state = state;

    // 1) Pulsación de un botón emitido por un flujo (incluye botones de mensajes antiguos).
    const parsed = parseButtonPayload(input.payload);
    if (parsed) {
      const flow = await loader(parsed.flowId);
      const node = flow?.nodes.find((n) => n.id === parsed.nodeId);
      if (flow && node && node.type === 'message') {
        // «Más opciones»: muestra la siguiente página del mismo mensaje, sin
        // avanzar el grafo y sin reenviar el archivo del encabezado.
        const more = parsed.buttonId.startsWith(MORE_PREFIX)
          ? parseInt(parsed.buttonId.slice(MORE_PREFIX.length), 10)
          : NaN;
        if (Number.isFinite(more)) {
          result.handled = true;
          result.messages.push(
            this.withPayloads(
              flow.id,
              node.id,
              this.renderMessage(node.data, variables, context, {
                page: more,
                includeMedia: false,
              }),
            ),
          );
          result.state = this.waitingState(flow.id, node.id, 'button');
          return result;
        }

        const button = this.replyButtons(node.data).find(
          (b) => b.id === parsed.buttonId,
        );
        if (button) {
          await this.followButton(
            flow,
            node,
            button,
            variables,
            loader,
            context,
            result,
          );
          return result;
        }
      }
    }

    if (!state) return result;

    const flow = await loader(state.flowId);
    const node = flow?.nodes.find((n) => n.id === state.nodeId);
    if (!flow || !node) {
      // Flujo borrado o nodo eliminado: se suelta la conversación.
      result.state = null;
      return result;
    }

    const text = (input.text || '').trim();
    // El contacto respondió (aunque no sirva): ficha nueva, el plazo vuelve a empezar.
    const retryState = (): ConversationFlowState => ({
      ...state,
      token: newWaitToken(),
      retries: state.retries + 1,
      updatedAt: new Date().toISOString(),
    });

    // 2) Esperando botón. Si escribe en lugar de pulsar, se intenta reconocer la
    //    opción (título, sinónimo, número, mención o IA). Si no, «Otra respuesta».
    if (state.waitingFor === 'button') {
      const button = await this.recognizeButton(
        flow,
        node,
        text,
        variables,
        context,
      );
      if (button) {
        await this.followButton(
          flow,
          node,
          button,
          variables,
          loader,
          context,
          result,
        );
        return result;
      }
      await this.handleNoMatch(
        flow,
        node,
        state,
        text,
        variables,
        loader,
        context,
        result,
      );
      return result;
    }

    // 3) Conversación con IA en curso.
    if (state.waitingFor === 'agent') {
      await this.continueAgent(
        flow,
        node,
        state,
        input,
        variables,
        loader,
        context,
        result,
      );
      return result;
    }

    // 4) Esperando la respuesta de un nodo Entrada.
    const reading = await this.readInput(flow, node, input, variables, context);

    if (reading.kind === 'invalid') {
      const maxRetries = this.maxRetries(node.data);
      if (state.retries + 1 > maxRetries) {
        // Sin intentos: sigue por «Sin respuesta válida» si está conectada; si no,
        // el flujo suelta la conversación para que responda el bot o un agente.
        const fallback = this.nextNodeId(flow, node.id, 'invalid');
        result.state = null;
        if (fallback) {
          result.handled = true;
          await this.runFrom(
            flow,
            fallback,
            variables,
            loader,
            context,
            result,
          );
        }
        return result;
      }
      result.handled = true;
      result.messages.push({
        text: this.interpolate(
          node.data.errorMessage ||
            defaultInputError(node.data.validation || 'any'),
          variables,
          context,
        ),
      });
      result.state = retryState();
      return result;
    }

    result.handled = true;
    result.state = null;
    if (reading.kind === 'ok') {
      this.storeAnswer(node.data, reading.value, variables, context, result);
      for (const extra of node.data.ai?.extras || []) {
        const v = reading.extras[extra.variable];
        if (!v) continue;
        variables[extra.variable] = v;
        if (extra.saveToField)
          this.queueContactUpdate(extra.saveToField, v, context, result);
      }
    }
    const next = this.nextNodeId(flow, node.id, 'next');
    if (next)
      await this.runFrom(flow, next, variables, loader, context, result);
    return result;
  }

  /**
   * Continúa el flujo cuando el contacto abre un enlace rastreado: ejecuta lo
   * que esté conectado a la salida «Al hacer clic» del botón.
   *
   * Si esa salida no tiene nada conectado devuelve handled=false y no toca el
   * estado, para que un clic no cancele lo que el contacto estaba respondiendo.
   * Si la tiene, el clic toma el control igual que pulsar un botón de un mensaje
   * anterior.
   */
  async resumeFromClick(
    link: { flowId: string; nodeId: string; buttonId: string; title: string },
    currentVariables: Record<string, string>,
    loader: FlowLoader,
    context: FlowContext,
    currentToken?: string,
  ): Promise<FlowRunResult> {
    const result = await this.clickInner(
      link,
      currentVariables,
      loader,
      context,
    );
    await this.armTimers(result, loader, currentToken, context);
    return result;
  }

  /**
   * Un temporizador venció: envía el recordatorio o sigue por «Sin respuesta».
   * Solo actúa si la conversación sigue esperando en ese nodo con la misma
   * ficha; si no (respondió, cambió de flujo, se borró el nodo), devuelve
   * handled=false y el llamador descarta el temporizador.
   */
  async resumeFromTimer(
    timer: {
      kind: FlowTimerKind;
      step: number;
      flowId: string;
      nodeId: string;
      token: string;
    },
    state: ConversationFlowState | null,
    currentVariables: Record<string, string>,
    loader: FlowLoader,
    context: FlowContext,
  ): Promise<FlowRunResult> {
    const result = this.emptyResult({ ...currentVariables });
    result.state = state;
    if (
      !state ||
      state.token !== timer.token ||
      state.flowId !== timer.flowId ||
      state.nodeId !== timer.nodeId
    )
      return result;
    const flow = await loader(timer.flowId);
    const node = flow?.nodes.find((n) => n.id === timer.nodeId);
    const config = node?.data.timeout;
    if (!flow || !node || !config?.enabled) return result;
    const variables = result.variables;

    if (timer.kind === 'reminder') {
      const reminder = config.reminders?.[timer.step];
      if (!reminder?.message?.trim()) return result;
      result.handled = true;
      const text = this.interpolate(reminder.message, variables, context);
      if (
        reminder.repeatOptions &&
        node.type === 'message' &&
        this.replyButtons(node.data).length
      ) {
        const msg = this.renderMessage(node.data, variables, context, {
          includeMedia: false,
        });
        result.messages.push(
          this.withPayloads(flow.id, node.id, {
            ...msg,
            text,
            header: undefined,
            actions: undefined,
          }),
        );
      } else if (reminder.repeatOptions && node.type === 'user_input') {
        const question = this.interpolate(
          node.data.text || '',
          variables,
          context,
        );
        result.messages.push({
          text: question ? `${text}\n\n${question}` : text,
        });
      } else {
        result.messages.push({ text });
      }
      if (reminder.template?.name) {
        result.templateFallback = {
          name: reminder.template.name,
          language: reminder.template.language || 'es',
          params: (reminder.template.params || []).map((p) =>
            this.interpolate(p, variables, context),
          ),
          text,
        };
      }
      // La espera sigue igual: mismos temporizadores pendientes.
      return result;
    }

    // Venció el plazo: «Sin respuesta».
    result.handled = true;
    result.state = null;
    variables.timeout_count = String(
      (Number(variables.timeout_count) || 0) + 1,
    );
    const next = this.nextNodeId(flow, node.id, 'timeout');
    if (next)
      await this.runFrom(flow, next, variables, loader, context, result);
    await this.armTimers(result, loader, state.token, context);
    return result;
  }

  /**
   * Si el resultado deja al flujo esperando con una ficha nueva, calcula los
   * temporizadores de ese nodo. Misma ficha = la espera no cambió (p. ej. un
   * recordatorio) y los temporizadores pendientes siguen valiendo.
   */
  private async armTimers(
    result: FlowRunResult,
    loader: FlowLoader,
    previousToken: string | undefined,
    context: FlowContext,
  ): Promise<void> {
    const state = result.state;
    if (!state?.token || state.token === previousToken) return;
    const flow = await loader(state.flowId);
    const node = flow?.nodes.find((n) => n.id === state.nodeId);
    if (!node) return;
    const from = context.now ?? new Date();
    result.timers = planTimers(node.data.timeout, from).map((t) => ({
      ...t,
      flowId: state.flowId,
      nodeId: state.nodeId,
      token: state.token!,
    }));
  }

  private async clickInner(
    link: { flowId: string; nodeId: string; buttonId: string; title: string },
    currentVariables: Record<string, string>,
    loader: FlowLoader,
    context: FlowContext,
  ): Promise<FlowRunResult> {
    const result = this.emptyResult({ ...currentVariables });
    const flow = await loader(link.flowId);
    const node = flow?.nodes.find((n) => n.id === link.nodeId);
    if (!flow || !node || node.type !== 'message') return result;

    const next = this.nextNodeId(flow, node.id, `click:${link.buttonId}`);
    if (!next) return result;

    result.handled = true;
    result.variables.last_link = link.title;
    await this.runFrom(flow, next, result.variables, loader, context, result);
    return result;
  }

  /**
   * Opción que eligió el contacto al escribir: primero por texto (título,
   * sinónimos, número, mención, errores de tipeo) y, si el nodo lo pide, con IA.
   */
  private async recognizeButton(
    flow: ConversationFlow,
    node: FlowNode,
    text: string,
    variables: Record<string, string>,
    context: FlowContext,
  ): Promise<FlowButton | null> {
    if (!text) return null;
    const buttons = this.replyButtons(node.data);
    const options = buttons.map((b) => ({
      title: this.interpolate(b.title, variables, context),
      keywords: b.keywords,
    }));
    const idx = matchReplyOption(options, text);
    if (idx >= 0) return buttons[idx];

    if (!node.data.noMatch?.ai || !this.ai) return null;
    const titles = options.map((o) => o.title);
    const extraction = await this.ai.extract({
      tenantId: flow.tenantId,
      flowId: flow.id,
      data: {
        validation: 'choice',
        choices: titles,
        ai: {
          enabled: true,
          instruction:
            'La opción que el contacto quiso elegir. Si no eligió claramente una de las opciones (hace otra pregunta, saluda o dice otra cosa), found=false.',
          mode: node.data.noMatch.aiMode,
        },
      },
      question: this.interpolate(node.data.text || '', variables, context),
      answer: text,
      now: context.now ?? new Date(),
    });
    if (!extraction?.found) return null;
    const picked = matchChoice(extraction.value, titles);
    return picked ? buttons[titles.indexOf(picked)] : null;
  }

  /**
   * El contacto escribió algo que no es una opción. Según el nodo: sigue por
   * «Otra respuesta» de inmediato, o avisa y repite las opciones hasta agotar
   * los intentos y entonces sigue por «Otra respuesta». Sin esa salida
   * conectada, al agotar los intentos el flujo suelta la conversación (bot o
   * agente), como antes.
   */
  private async handleNoMatch(
    flow: ConversationFlow,
    node: FlowNode,
    state: ConversationFlowState,
    text: string,
    variables: Record<string, string>,
    loader: FlowLoader,
    context: FlowContext,
    result: FlowRunResult,
  ): Promise<void> {
    const cfg = node.data.noMatch ?? {};
    // Lo que escribió queda disponible para la rama «Otra respuesta».
    if (text) variables.last_reply = text;
    const target = this.nextNodeId(flow, node.id, 'nomatch');

    const goOther = async () => {
      result.state = null;
      if (!target) return; // sin salida: el flujo suelta la conversación
      result.handled = true;
      await this.runFrom(flow, target, variables, loader, context, result);
    };

    if (cfg.mode === 'branch' && target) return goOther();

    const max =
      typeof cfg.maxRetries === 'number' && Number.isFinite(cfg.maxRetries)
        ? Math.min(
            Math.max(Math.floor(cfg.maxRetries), 0),
            MAX_NO_MATCH_RETRIES,
          )
        : DEFAULT_NO_MATCH_RETRIES;
    if (state.retries + 1 > max) return goOther();

    result.handled = true;
    const repeat = cfg.repeatOptions !== false;
    const notice = this.interpolate(
      cfg.message?.trim() ||
        (repeat
          ? 'No reconocí tu respuesta. Por favor elige una de las opciones:'
          : 'Por favor elige una de las opciones.'),
      variables,
      context,
    );
    if (repeat) {
      // Un solo mensaje: el aviso con los mismos botones (sin el archivo del
      // encabezado ni los botones de enlace, que ya se enviaron).
      const msg = this.renderMessage(node.data, variables, context, {
        includeMedia: false,
      });
      result.messages.push(
        this.withPayloads(flow.id, node.id, {
          ...msg,
          text: notice,
          header: undefined,
          actions: undefined,
        }),
      );
    } else {
      result.messages.push({ text: notice });
    }
    result.state = {
      ...state,
      token: newWaitToken(),
      retries: state.retries + 1,
      updatedAt: new Date().toISOString(),
    };
  }

  /** Continúa por la salida del botón pulsado. */
  private async followButton(
    flow: ConversationFlow,
    node: FlowNode,
    button: FlowButton,
    variables: Record<string, string>,
    loader: FlowLoader,
    context: FlowContext,
    result: FlowRunResult,
  ): Promise<void> {
    result.handled = true;
    result.state = null;
    variables.last_button = button.title;
    const next = this.nextNodeId(flow, node.id, `btn:${button.id}`);
    if (next)
      await this.runFrom(flow, next, variables, loader, context, result);
  }

  // ─── Ejecución ────────────────────────────────────────────────

  private async runFrom(
    initialFlow: ConversationFlow,
    initialNodeId: string,
    variables: Record<string, string>,
    loader: FlowLoader,
    context: FlowContext,
    result: FlowRunResult,
  ): Promise<void> {
    let flow = initialFlow;
    let nodeId: string | null = initialNodeId;
    let steps = 0;

    while (nodeId) {
      if (++steps > MAX_STEPS_PER_TURN) {
        console.warn(
          `[ConversationFlow] Límite de pasos alcanzado en flujo ${flow.id}; posible bucle.`,
        );
        result.state = null;
        return;
      }

      const node: FlowNode | undefined = flow.nodes.find(
        (n) => n.id === nodeId,
      );
      if (!node) break;

      switch (node.type) {
        case 'start':
          nodeId = this.nextNodeId(flow, node.id, 'next');
          break;

        case 'message': {
          const msg = this.renderMessage(node.data, variables, context);
          if (
            msg.text ||
            msg.buttons?.length ||
            msg.actions?.length ||
            msg.headerMedia
          )
            result.messages.push(this.withPayloads(flow.id, node.id, msg));
          // Solo los botones de respuesta esperan al contacto; enlaces y
          // llamadas no, y el flujo sigue por «Siguiente».
          if (this.replyButtons(node.data).length) {
            result.state = this.waitingState(flow.id, node.id, 'button');
            return;
          }
          nodeId = this.nextNodeId(flow, node.id, 'next');
          break;
        }

        case 'user_input': {
          // «No preguntar si ya lo sabemos»: con valor en la variable o en el CRM sigue de largo.
          const known = this.knownAnswer(node.data, variables, context);
          if (known !== null) {
            if (node.data.variable) variables[node.data.variable] = known;
            nodeId = this.nextNodeId(flow, node.id, 'next');
            break;
          }
          let text = this.interpolate(node.data.text || '', variables, context);
          if (node.data.validation === 'choice' && node.data.showChoices) {
            const list = formatChoices(node.data.choices || []);
            if (list) text = text ? `${text}\n\n${list}` : list;
          }
          if (text) result.messages.push({ text });
          result.state = this.waitingState(flow.id, node.id, 'input');
          return;
        }

        case 'action': {
          let terminal = false;
          for (const action of node.data.actions || []) {
            switch (action.type) {
              case 'set_variable':
                if (action.variable) {
                  variables[action.variable] = this.interpolate(
                    action.value || '',
                    variables,
                    context,
                  );
                }
                break;
              case 'add_label':
                if (action.labelId)
                  result.effects.addLabelIds.push(action.labelId);
                break;
              case 'remove_label':
                if (action.labelId)
                  result.effects.removeLabelIds.push(action.labelId);
                break;
              case 'handoff':
                result.effects.handoff = true;
                terminal = true;
                break;
              case 'resolve':
                result.effects.resolve = true;
                terminal = true;
                break;
            }
          }
          if (terminal) {
            result.state = null;
            return;
          }
          nodeId = this.nextNodeId(flow, node.id, 'next');
          break;
        }

        case 'condition': {
          if (Array.isArray(node.data.branches)) {
            // Ramas en orden: sigue la primera que se cumple; si ninguna, «Si no».
            const env = this.conditionEnv(variables, context);
            const hit = node.data.branches.find((b) => evaluateBranch(b, env));
            if (hit) variables.last_branch = hit.name;
            nodeId = this.nextNodeId(
              flow,
              node.id,
              hit ? `cond:${hit.id}` : 'else',
            );
          } else {
            // Nodo antiguo de una sola regla: salidas Sí / No.
            const passed = this.evaluateCondition(
              node.data,
              variables,
              context,
            );
            nodeId = this.nextNodeId(flow, node.id, passed ? 'true' : 'false');
          }
          break;
        }

        case 'ai_agent': {
          const next = await this.enterAgent(
            flow,
            node,
            variables,
            context,
            result,
          );
          if (next === 'wait') return;
          nodeId = next;
          break;
        }

        case 'start_flow': {
          const targetId = node.data.targetFlowId;
          const target = targetId ? await loader(targetId) : null;
          if (!target) {
            nodeId = null;
            break;
          }
          const targetStart = target.nodes.find((n) => n.type === 'start');
          flow = target;
          result.startedFlowIds.push(target.id);
          nodeId = targetStart?.id || null;
          break;
        }

        default:
          nodeId = null;
      }
    }

    // Sin más nodos: el flujo terminó.
    result.state = null;
  }

  // ─── Utilidades ───────────────────────────────────────────────

  private emptyResult(variables: Record<string, string>): FlowRunResult {
    return {
      handled: false,
      messages: [],
      state: null,
      variables,
      effects: {
        handoff: false,
        resolve: false,
        addLabelIds: [],
        removeLabelIds: [],
      },
      startedFlowIds: [],
      contactUpdates: {},
      timers: [],
    };
  }

  private waitingState(
    flowId: string,
    nodeId: string,
    waitingFor: ConversationFlowState['waitingFor'],
  ): ConversationFlowState {
    const now = new Date().toISOString();
    return {
      flowId,
      nodeId,
      waitingFor,
      token: newWaitToken(),
      retries: 0,
      startedAt: now,
      updatedAt: now,
    };
  }

  private nextNodeId(
    flow: ConversationFlow,
    sourceId: string,
    handle: string,
  ): string | null {
    const edge = flow.edges.find(
      (e) => e.source === sourceId && (e.sourceHandle || 'next') === handle,
    );
    return edge?.target || null;
  }

  /** Botones de respuesta con título (los únicos que ramifican el flujo). */
  private replyButtons(data: FlowNodeData): FlowButton[] {
    return (data.buttons || []).filter(
      (b) => (b.type ?? 'reply') === 'reply' && b.title?.trim(),
    );
  }

  /**
   * Divide los botones de respuesta en páginas de 2 + «Más opciones» (3 en
   * total, el máximo de WhatsApp). La última página admite hasta 3 opciones.
   */
  private paginateReplies(
    buttons: FlowButton[],
    page: number,
  ): { items: FlowButton[]; hasMore: boolean; page: number } {
    const pages: FlowButton[][] = [];
    let i = 0;
    while (buttons.length - i > WA_MAX_REPLY_BUTTONS) {
      pages.push(buttons.slice(i, i + PAGE_SIZE));
      i += PAGE_SIZE;
    }
    pages.push(buttons.slice(i));
    const p = Math.min(
      Math.max(Number.isFinite(page) ? page : 0, 0),
      pages.length - 1,
    );
    return { items: pages[p], hasMore: p < pages.length - 1, page: p };
  }

  /**
   * Arma el mensaje del nodo. `page` y `includeMedia` solo cambian cuando se
   * pagina o se repiten las opciones: las páginas siguientes no vuelven a
   * enviar el archivo del encabezado ni los enlaces.
   */
  private renderMessage(
    data: FlowNodeData,
    variables: Record<string, string>,
    context: FlowContext,
    opts: { page?: number; includeMedia?: boolean } = {},
  ): FlowOutgoingMessage {
    const page = opts.page ?? 0;
    const includeMedia = opts.includeMedia ?? true;

    let buttons: FlowButton[] = this.replyButtons(data).map((b) => ({
      id: b.id,
      title: this.interpolate(b.title, variables, context),
    }));

    const mediaType =
      data.headerType && data.headerType !== 'text' ? data.headerType : null;
    const hasMediaHeader = !!(mediaType && data.headerMediaUrl);
    const headerMedia: FlowHeaderMedia | undefined =
      includeMedia && hasMediaHeader && mediaType
        ? {
            type: mediaType,
            url: data.headerMediaUrl as string,
            filename: data.headerMediaName,
          }
        : undefined;

    // Más de 3 respuestas + archivo en el encabezado: WhatsApp no admite ambos
    // en una lista, así que por defecto se pagina (a menos que se elija 'list').
    const paginate =
      !!context.whatsappCloud &&
      hasMediaHeader &&
      buttons.length > WA_MAX_REPLY_BUTTONS &&
      data.overflow !== 'list';
    if (paginate) {
      const p = this.paginateReplies(buttons, page);
      buttons = p.items;
      if (p.hasMore) {
        buttons = [
          ...buttons,
          { id: `${MORE_PREFIX}${p.page + 1}`, title: MORE_TITLE },
        ];
      }
    }

    // Botones de enlace / llamada. Solo en la primera página.
    const actions: FlowOutgoingAction[] =
      page === 0 ? this.renderActions(data, variables, context) : [];

    return {
      text: this.interpolate(data.text || '', variables, context),
      headerMedia,
      actions: actions.length ? actions : undefined,
      header:
        !headerMedia && data.header
          ? this.interpolate(data.header, variables, context).slice(0, 60) ||
            undefined
          : undefined,
      footer: data.footer
        ? this.interpolate(data.footer, variables, context).slice(0, 60) ||
          undefined
        : undefined,
      buttons: buttons.length ? buttons : undefined,
    };
  }

  /**
   * Resuelve los botones de enlace y llamada: sustituye {{variables}} (codificadas
   * en la URL) y descarta los que quedaron sin destino válido.
   */
  private renderActions(
    data: FlowNodeData,
    variables: Record<string, string>,
    context: FlowContext,
  ): FlowOutgoingAction[] {
    const out: FlowOutgoingAction[] = [];
    for (const b of data.buttons || []) {
      if (!b.title?.trim()) continue;
      const title = this.interpolate(b.title, variables, context);
      if (b.type === 'url' && b.url) {
        const url = this.interpolateUrl(b.url, variables, context);
        if (isHttpUrl(url))
          out.push({
            type: 'url',
            title,
            url,
            buttonId: b.id,
            track: b.track !== false,
          });
        else
          console.warn(
            `[ConversationFlow] Botón «${b.title}» omitido: URL no válida tras sustituir variables.`,
          );
      } else if (b.type === 'call' && b.phone) {
        const phone = normalizePhone(b.phone);
        if (phone) out.push({ type: 'call', title, phone, buttonId: b.id });
      }
    }
    return out;
  }

  /** Como interpolate, pero codifica los valores para que no rompan la URL. */
  private interpolateUrl(
    url: string,
    variables: Record<string, string>,
    context: FlowContext,
  ): string {
    return url.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) =>
      encodeURIComponent(this.lookup(key, variables, context)),
    );
  }

  /** Sustituye los ids de botón por el payload completo que viaja al canal. */
  private withPayloads(
    flowId: string,
    nodeId: string,
    msg: FlowOutgoingMessage,
  ): FlowOutgoingMessage {
    const source = { flowId, nodeId };
    if (!msg.buttons?.length) return { ...msg, source };
    return {
      ...msg,
      source,
      buttons: msg.buttons.map((b) => ({
        id: buildButtonPayload(flowId, nodeId, b.id),
        title: b.title,
      })),
    };
  }

  private normalize(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[.)]+$/, '')
      .trim();
  }

  // ─── Conversación con IA ──────────────────────────────────────

  /**
   * Entra al nodo: envía el primer mensaje (fijo o escrito por la IA) y queda
   * esperando al contacto. Devuelve 'wait' o el siguiente nodo si el tramo
   * terminó de inmediato (IA no disponible o resultado en el primer mensaje).
   */
  private async enterAgent(
    flow: ConversationFlow,
    node: FlowNode,
    variables: Record<string, string>,
    context: FlowContext,
    result: FlowRunResult,
  ): Promise<string | null | 'wait'> {
    const config = node.data.agent;
    if (!config?.outcomes?.length)
      return this.nextNodeId(flow, node.id, 'error');

    const first = this.interpolate(
      config.firstMessage || '',
      variables,
      context,
    ).trim();
    if (first) {
      result.messages.push({ text: first });
      result.state = this.agentState(
        flow.id,
        node.id,
        pushHistory([], 'assistant', first),
        0,
      );
      return 'wait';
    }

    const turn = await this.agentTurn(flow, node, [], variables, context);
    if (!turn) return this.nextNodeId(flow, node.id, 'error');
    return this.applyAgentTurn(
      flow,
      node,
      turn,
      [],
      0,
      variables,
      context,
      result,
    );
  }

  /** Un mensaje del contacto dentro del tramo con IA. */
  private async continueAgent(
    flow: ConversationFlow,
    node: FlowNode,
    state: ConversationFlowState,
    input: FlowInput,
    variables: Record<string, string>,
    loader: FlowLoader,
    context: FlowContext,
    result: FlowRunResult,
  ): Promise<void> {
    if (node.type !== 'ai_agent' || !node.data.agent) {
      result.state = null;
      return;
    }
    let text = (input.text || '').trim();
    const media = input.media;
    if (!text && media?.url && mediaKindOf(media.type) === 'audio' && this.ai) {
      text =
        (await this.ai.transcribe(flow.tenantId, flow.id, media.url)) || '';
    }
    if (!text && media) {
      const kind = mediaKindOf(media.type);
      const names = {
        image: 'una imagen',
        video: 'un video',
        audio: 'un audio',
        document: 'un documento',
      };
      text = kind ? `[El contacto envió ${names[kind]}]` : '';
    }
    result.handled = true;
    if (!text) return; // p. ej. una reacción: no hay nada que responder

    const history = pushHistory(state.agent?.history ?? [], 'user', text);
    const turns = (state.agent?.turns ?? 0) + 1;
    const turn = await this.agentTurn(flow, node, history, variables, context);
    result.state = null;
    if (!turn) {
      // La IA falló a mitad de la conversación: «Si la IA falla» o, sin esa
      // salida, se suelta la conversación para que la atienda el bot o un agente.
      const fallback = this.nextNodeId(flow, node.id, 'error');
      if (fallback)
        await this.runFrom(flow, fallback, variables, loader, context, result);
      else result.handled = false;
      return;
    }
    const next = await this.applyAgentTurn(
      flow,
      node,
      turn,
      history,
      turns,
      variables,
      context,
      result,
    );
    if (next && next !== 'wait')
      await this.runFrom(flow, next, variables, loader, context, result);
  }

  private async agentTurn(
    flow: ConversationFlow,
    node: FlowNode,
    history: AgentHistory,
    variables: Record<string, string>,
    context: FlowContext,
  ): Promise<AgentTurn | null> {
    if (!this.ai || !node.data.agent) return null;
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(context.contact || {}))
      if (v?.trim()) data[k] = v;
    for (const [k, v] of Object.entries(variables)) if (v?.trim()) data[k] = v;
    return this.ai.converse({
      tenantId: flow.tenantId,
      flowId: flow.id,
      config: node.data.agent,
      history,
      known: {
        contactName: context.contactName || undefined,
        channel: context.channel,
        data,
      },
    });
  }

  /**
   * Aplica un turno: guarda los datos, envía la respuesta y decide si el tramo
   * sigue ('wait') o sale por un resultado, «Transferir» o «Límite».
   */
  private applyAgentTurn(
    flow: ConversationFlow,
    node: FlowNode,
    turn: AgentTurn,
    history: AgentHistory,
    turns: number,
    variables: Record<string, string>,
    context: FlowContext,
    result: FlowRunResult,
  ): string | null | 'wait' {
    const config = node.data.agent!;
    for (const c of config.collect || []) {
      const value = turn.saved[c.variable];
      if (!value) continue;
      variables[c.variable] = value;
      if (c.saveToField)
        this.queueContactUpdate(c.saveToField, value, context, result);
    }
    let next = history;
    if (turn.reply) {
      result.messages.push({ text: turn.reply });
      next = pushHistory(history, 'assistant', turn.reply);
    }

    if (turn.finish) {
      variables.ai_outcome = turn.finish.outcome.name;
      if (turn.finish.summary) variables.ai_summary = turn.finish.summary;
      result.state = null;
      return this.nextNodeId(flow, node.id, `out:${turn.finish.outcome.id}`);
    }
    if (turn.handoff) {
      variables.ai_outcome = 'Transferir a un agente';
      if (turn.handoff.reason) variables.ai_summary = turn.handoff.reason;
      result.state = null;
      const target = this.nextNodeId(flow, node.id, 'handoff');
      // Sin nada conectado a «Transferir»: se transfiere directamente.
      if (!target) result.effects.handoff = true;
      return target;
    }
    const max = this.agentMaxTurns(config.maxTurns);
    if (turns >= max) {
      variables.ai_outcome = 'Límite de mensajes';
      result.state = null;
      return this.nextNodeId(flow, node.id, 'limit');
    }
    result.state = this.agentState(flow.id, node.id, next, turns);
    return 'wait';
  }

  private agentMaxTurns(n: number | undefined): number {
    return typeof n === 'number' && Number.isFinite(n)
      ? Math.min(Math.max(Math.floor(n), 1), AGENT_MAX_TURNS)
      : AGENT_DEFAULT_TURNS;
  }

  private agentState(
    flowId: string,
    nodeId: string,
    history: AgentHistory,
    turns: number,
  ): ConversationFlowState {
    return {
      ...this.waitingState(flowId, nodeId, 'agent'),
      agent: { history, turns },
    };
  }

  // ─── Nodo Entrada ─────────────────────────────────────────────

  /**
   * Lee la respuesta del contacto:
   *  - una palabra para saltar la pregunta → skip (sigue sin guardar nada);
   *  - archivo o ubicación según el tipo;
   *  - texto (o nota de voz transcrita) validado y normalizado; con IA activa,
   *    primero se extrae el dato y luego se valida igual que si lo hubiera escrito.
   */
  private async readInput(
    flow: ConversationFlow,
    node: FlowNode,
    input: FlowInput,
    variables: Record<string, string>,
    context: FlowContext,
  ): Promise<
    | { kind: 'skip' }
    | { kind: 'invalid' }
    | { kind: 'ok'; value: string; extras: Record<string, string> }
  > {
    const data = node.data;
    const type = data.validation || 'any';
    const now = context.now ?? new Date();
    let text = (input.text || '').trim();

    if (text && data.skipKeywords?.length) {
      const said = normalizeText(text);
      if (data.skipKeywords.some((k) => normalizeText(k) === said))
        return { kind: 'skip' };
    }

    if (type === 'media') {
      const url = readMediaInput(input.media, data.mediaKinds);
      return url ? { kind: 'ok', value: url, extras: {} } : { kind: 'invalid' };
    }
    if (type === 'location') {
      const loc = readLocationInput(input.media, text);
      return loc ? { kind: 'ok', value: loc, extras: {} } : { kind: 'invalid' };
    }

    const ai = data.ai?.enabled ? this.ai : undefined;
    // Nota de voz: con IA y transcripción activas se convierte en texto.
    if (
      !text &&
      ai &&
      data.ai?.transcribeAudio &&
      input.media?.url &&
      mediaKindOf(input.media.type) === 'audio'
    ) {
      text =
        (await ai.transcribe(flow.tenantId, flow.id, input.media.url)) || '';
    }
    if (!text) return { kind: 'invalid' };

    if (ai) {
      const extraction = await ai.extract({
        tenantId: flow.tenantId,
        flowId: flow.id,
        data,
        question: this.interpolate(data.text || '', variables, context),
        answer: text,
        now,
      });
      if (extraction) {
        if (!extraction.found) return { kind: 'invalid' };
        // Lo que devuelve la IA pasa por la misma validación; si no encaja, se
        // prueba con el texto original antes de darla por no válida.
        const value =
          validateInputValue(extraction.value, data, now) ??
          validateInputValue(text, data, now);
        return value === null
          ? { kind: 'invalid' }
          : { kind: 'ok', value, extras: extraction.extras };
      }
      // IA no disponible (sin clave, sin créditos, error): se valida sin ella.
    }

    const value = validateInputValue(text, data, now);
    return value === null
      ? { kind: 'invalid' }
      : { kind: 'ok', value, extras: {} };
  }

  private maxRetries(data: FlowNodeData): number {
    const n = data.maxRetries;
    return typeof n === 'number' && Number.isFinite(n)
      ? Math.min(Math.max(Math.floor(n), 0), MAX_INPUT_RETRIES_LIMIT)
      : DEFAULT_INPUT_RETRIES;
  }

  /** Valor ya conocido para un nodo con «no preguntar si ya tiene valor»; null si hay que preguntar. */
  private knownAnswer(
    data: FlowNodeData,
    variables: Record<string, string>,
    context: FlowContext,
  ): string | null {
    if (!data.skipIfFilled) return null;
    const fromVariable = data.variable
      ? this.lookup(data.variable, variables, context).trim()
      : '';
    if (fromVariable) return fromVariable;
    const field = data.saveToField;
    const fromCrm =
      field &&
      context.contact &&
      Object.prototype.hasOwnProperty.call(context.contact, field)
        ? (context.contact[field] ?? '').trim()
        : '';
    return fromCrm || null;
  }

  private storeAnswer(
    data: FlowNodeData,
    value: string,
    variables: Record<string, string>,
    context: FlowContext,
    result: FlowRunResult,
  ): void {
    if (data.variable) variables[data.variable] = value;
    if (data.saveToField)
      this.queueContactUpdate(data.saveToField, value, context, result);
  }

  /**
   * Anota un campo del CRM para guardar y lo refleja en el contexto, para que
   * los nodos siguientes del mismo turno ya vean el valor nuevo.
   */
  private queueContactUpdate(
    field: string,
    value: string,
    context: FlowContext,
    result: FlowRunResult,
  ): void {
    result.contactUpdates[field] = value;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    context.contact = {
      ...(context.contact || {}),
      // Las fechas del CRM se muestran como dd/mm/aaaa.
      [field]: iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : value,
    };
  }

  /** Datos con los que se evalúan las reglas de un nodo Condición. */
  private conditionEnv(
    variables: Record<string, string>,
    context: FlowContext,
  ): ConditionEnv {
    return {
      now: context.now ?? new Date(),
      lastMessage: context.lastMessage ?? '',
      channel: context.channel ?? '',
      inboxId: context.inboxId ?? '',
      labelIds: context.labelIds ?? [],
      conversationStatus: context.conversationStatus ?? '',
      inboundCount: context.inboundCount ?? 0,
      hasContact: context.hasContact ?? false,
      lookup: (key) => this.lookup(key, variables, context),
      interpolate: (text) => this.interpolate(text, variables, context),
      random: context.random ?? Math.random,
    };
  }

  private evaluateCondition(
    data: FlowNodeData,
    variables: Record<string, string>,
    context: FlowContext,
  ): boolean {
    // La variable puede ser del flujo o un campo del CRM (p. ej. `city`), y el
    // valor a comparar admite {{variables}} (p. ej. comparar con otro campo).
    const value = data.conditionVariable
      ? this.lookup(data.conditionVariable, variables, context)
      : '';
    const expected = this.interpolate(
      data.conditionValue ?? '',
      variables,
      context,
    );
    switch (data.conditionOperator || 'equals') {
      case 'equals':
        return this.normalize(value) === this.normalize(expected);
      case 'not_equals':
        return this.normalize(value) !== this.normalize(expected);
      case 'contains':
        return this.normalize(value).includes(this.normalize(expected));
      case 'is_set':
        return value.trim() !== '';
      case 'is_not_set':
        return value.trim() === '';
      case 'greater_than':
        return parseFloat(value) > parseFloat(expected);
      case 'less_than':
        return parseFloat(value) < parseFloat(expected);
      default:
        return false;
    }
  }

  /**
   * Valor de una variable. Orden de búsqueda:
   *   1. {{contact_name}}: nombre con el que aparece en el chat.
   *   2. Variables del flujo (lo que el contacto respondió o se asignó). Tienen
   *      prioridad sobre el CRM: si el contacto acaba de escribir su email, ese
   *      es el que cuenta aunque el CRM tenga otro.
   *   3. Campos del CRM del contacto (sistema y personalizados).
   *   4. Vacío si no existe.
   * Solo se leen claves propias: `{{constructor}}` o `{{toString}}` no deben
   * devolver código de JavaScript.
   */
  private lookup(
    key: string,
    variables: Record<string, string>,
    context: FlowContext,
  ): string {
    if (key === 'contact_name' || key === 'contact.name')
      return context.contactName || '';
    if (Object.prototype.hasOwnProperty.call(variables, key))
      return variables[key] ?? '';
    const contact = context.contact;
    if (contact && Object.prototype.hasOwnProperty.call(contact, key))
      return contact[key] ?? '';
    return '';
  }

  /** Reemplaza {{variable}} en el texto con variables del flujo y campos del CRM. */
  interpolate(
    text: string,
    variables: Record<string, string>,
    context: FlowContext,
  ): string {
    return (text || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) =>
      this.lookup(key, variables, context),
    );
  }
}
