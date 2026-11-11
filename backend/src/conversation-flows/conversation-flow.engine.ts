import { Injectable } from '@nestjs/common';
import {
  ConversationFlow,
  ConversationFlowState,
  FlowButton,
  FlowNode,
  FlowInputValidation,
  FlowNodeData,
} from './conversation-flow.entity';

/** Mensaje que el flujo quiere enviar al contacto. */
export interface FlowOutgoingMessage {
  text: string;
  buttons?: FlowButton[];
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
}

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
      const button = node?.data.buttons?.find((b) => b.id === parsed.buttonId);
      if (flow && node && button) {
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
      const button = this.matchButton(node.data.buttons || [], text);
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
          this.renderMessage(node.data, variables, context),
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
          if (msg.text || msg.buttons?.length)
            result.messages.push(this.withPayloads(flow.id, node.id, msg));
          if (msg.buttons?.length) {
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
          const passed = this.evaluateCondition(node.data, variables);
          nodeId = this.nextNodeId(flow, node.id, passed ? 'true' : 'false');
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

  private renderMessage(
    data: FlowNodeData,
    variables: Record<string, string>,
    context: FlowContext,
  ): FlowOutgoingMessage {
    const buttons = (data.buttons || [])
      .filter((b) => b.title?.trim())
      .map((b) => ({
        id: b.id,
        title: this.interpolate(b.title, variables, context),
      }));
    return {
      text: this.interpolate(data.text || '', variables, context),
      buttons: buttons.length ? buttons : undefined,
    };
  }

  /** Sustituye los ids de botón por el payload completo que viaja al canal. */
  private withPayloads(
    flowId: string,
    nodeId: string,
    msg: FlowOutgoingMessage,
  ): FlowOutgoingMessage {
    if (!msg.buttons?.length) return msg;
    return {
      ...msg,
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

  private evaluateCondition(
    data: FlowNodeData,
    variables: Record<string, string>,
  ): boolean {
    const raw = data.conditionVariable
      ? variables[data.conditionVariable]
      : undefined;
    const value = raw ?? '';
    const expected = data.conditionValue ?? '';
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

  /** Reemplaza {{variable}} y {{contact_name}} en el texto. */
  interpolate(
    text: string,
    variables: Record<string, string>,
    context: FlowContext,
  ): string {
    return (text || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
      if (key === 'contact_name' || key === 'contact.name')
        return context.contactName || '';
      return variables[key] ?? '';
    });
  }
}
