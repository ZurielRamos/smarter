import { Injectable } from '@nestjs/common';
import {
  ConversationFlow,
  ConversationFlowState,
  FlowButton,
  FlowNode,
  FlowInputValidation,
  FlowNodeData,
  FlowHeaderMedia,
} from './conversation-flow.entity';
import { isHttpUrl, normalizePhone } from './flow-buttons.util';
import { evaluateBranch, type ConditionEnv } from './flow-conditions.util';

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
}

export interface FlowInput {
  text: string | null;
  /** id del botón pulsado (WhatsApp button_reply/list_reply, quick_reply payload) */
  payload?: string | null;
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
const MAX_BUTTON_RETRIES = 2;
const MAX_INPUT_RETRIES = 3;

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
  /** Inicia un flujo desde su nodo Inicio. */
  async start(
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
    const retryState = (): ConversationFlowState => ({
      ...state,
      retries: state.retries + 1,
      updatedAt: new Date().toISOString(),
    });

    // 2) Esperando botón: se acepta título exacto o número de opción (canales en texto).
    if (state.waitingFor === 'button') {
      const button = this.matchButton(this.replyButtons(node.data), text);
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

      if (state.retries + 1 > MAX_BUTTON_RETRIES) {
        // Demasiados intentos: el flujo suelta la conversación para que responda el bot/agente.
        result.state = null;
        return result;
      }
      result.handled = true;
      result.messages.push({ text: 'Por favor elige una de las opciones.' });
      result.messages.push(
        this.withPayloads(
          flow.id,
          node.id,
          // Al repetir las opciones no se vuelve a enviar el archivo del encabezado.
          this.renderMessage(node.data, variables, context, {
            includeMedia: false,
          }),
        ),
      );
      result.state = retryState();
      return result;
    }

    // 3) Esperando entrada de texto.
    const validation = node.data.validation || 'any';
    const value = this.validateInput(text, validation);
    if (value === null) {
      if (state.retries + 1 > MAX_INPUT_RETRIES) {
        result.state = null;
        return result;
      }
      result.handled = true;
      result.messages.push({
        text: this.interpolate(
          node.data.errorMessage || this.defaultErrorMessage(validation),
          variables,
          context,
        ),
      });
      result.state = retryState();
      return result;
    }

    result.handled = true;
    result.state = null;
    if (node.data.variable) variables[node.data.variable] = value;
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
          const text = this.interpolate(
            node.data.text || '',
            variables,
            context,
          );
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
    };
  }

  private waitingState(
    flowId: string,
    nodeId: string,
    waitingFor: 'button' | 'input',
  ): ConversationFlowState {
    const now = new Date().toISOString();
    return {
      flowId,
      nodeId,
      waitingFor,
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

  private matchButton(buttons: FlowButton[], text: string): FlowButton | null {
    if (!text) return null;
    const norm = this.normalize(text);
    const byTitle = buttons.find((b) => this.normalize(b.title) === norm);
    if (byTitle) return byTitle;
    // Canales sin botones nativos reciben "1. Opción"; se acepta el número.
    const idx = /^\d{1,2}$/.test(norm) ? parseInt(norm, 10) - 1 : -1;
    return idx >= 0 && idx < buttons.length ? buttons[idx] : null;
  }

  private normalize(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[.)]+$/, '')
      .trim();
  }

  private validateInput(
    text: string,
    validation: FlowInputValidation,
  ): string | null {
    if (!text) return null;
    switch (validation) {
      case 'number': {
        const v = text.replace(/\s/g, '');
        return /^-?\d+([.,]\d+)?$/.test(v) ? v.replace(',', '.') : null;
      }
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)
          ? text.toLowerCase()
          : null;
      case 'phone': {
        const digits = text.replace(/[\s\-().]/g, '');
        return /^\+?\d{7,15}$/.test(digits) ? digits : null;
      }
      default:
        return text;
    }
  }

  private defaultErrorMessage(validation: FlowInputValidation): string {
    switch (validation) {
      case 'number':
        return 'Por favor escribe un número válido.';
      case 'email':
        return 'Por favor escribe un correo electrónico válido.';
      case 'phone':
        return 'Por favor escribe un número de teléfono válido.';
      default:
        return 'Por favor escribe una respuesta.';
    }
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
