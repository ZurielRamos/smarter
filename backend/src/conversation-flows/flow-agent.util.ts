import type {
  FlowAgentConfig,
  FlowAgentOutcome,
} from './conversation-flow.entity';
import { normalizeText } from './flow-conditions.util';

/**
 * Prompt y herramientas del nodo «Conversación con IA». Funciones puras para
 * poder probarlas sin llamar a la IA.
 */

export const AGENT_MAX_OUTCOMES = 8;
export const AGENT_MAX_COLLECT = 10;
export const AGENT_DEFAULT_TURNS = 10;
export const AGENT_MAX_TURNS = 30;
/** Mensajes que se guardan del tramo (los más recientes). */
export const AGENT_HISTORY_LIMIT = 20;
export const AGENT_MESSAGE_MAX = 1500;

export const FINISH_TOOL = 'finish_conversation';
export const HANDOFF_TOOL = 'transfer_to_human';
export const SAVE_TOOL = 'save_data';

export interface AgentKnownData {
  contactName?: string;
  channel?: string;
  /** Variables del flujo y campos del CRM con valor */
  data: Record<string, string>;
}

const CHANNEL_NAMES: Record<string, string> = {
  whatsapp: 'WhatsApp',
  evolution: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  chat: 'el chat de la web',
};

/** Instrucciones del tramo que se añaden (o sustituyen, sin bot) al prompt del bot. */
export function buildAgentPrompt(
  config: FlowAgentConfig,
  known: AgentKnownData,
): string {
  const outcomes = config.outcomes.filter((o) => o.id && o.name);
  const collect = (config.collect || []).filter(
    (c) => c.variable && c.description,
  );
  const lines: string[] = [];
  lines.push(
    `Estás atendiendo un tramo de una conversación automatizada por ${CHANNEL_NAMES[known.channel || ''] || 'chat'}. Al terminar este tramo la conversación sigue por otro camino del flujo.`,
  );
  if (config.instructions?.trim()) {
    lines.push(
      '',
      'OBJETIVO E INSTRUCCIONES DE ESTE TRAMO:',
      config.instructions.trim(),
    );
  }
  lines.push(
    '',
    `CÓMO TERMINAR: cuando la conversación llegue a uno de estos resultados, llama a la herramienta ${FINISH_TOOL} con su id. No sigas conversando después de llamarla; si quieres despedirte o dar un último mensaje, ponlo en el campo "message".`,
  );
  for (const o of outcomes) {
    lines.push(
      `- id "${o.id}": ${o.name}${o.description?.trim() ? ` — ${o.description.trim()}` : ''}`,
    );
  }
  if (collect.length) {
    lines.push(
      '',
      `DATOS A AVERIGUAR: pregúntalos con naturalidad, uno a la vez. Apenas el contacto dé alguno, llama a ${SAVE_TOOL} con lo que dijo. No inventes datos.`,
    );
    for (const c of collect) lines.push(`- ${c.variable}: ${c.description}`);
  }
  if (config.allowHandoff !== false) {
    lines.push(
      '',
      `Si el contacto pide hablar con una persona, está molesto o no puedes ayudarlo, llama a ${HANDOFF_TOOL}.`,
    );
  }
  lines.push(
    '',
    'ESTILO: mensajes cortos de chat, en texto plano (sin markdown ni asteriscos), en el idioma del contacto. No inventes precios, políticas ni datos que no conozcas.',
  );

  const known_ = Object.entries(known.data)
    .filter(([, v]) => v && v.trim())
    .slice(0, 30)
    .map(([k, v]) => `- ${k}: ${v.slice(0, 200)}`);
  if (known.contactName || known_.length) {
    lines.push(
      '',
      'DATOS QUE YA CONOCES DEL CONTACTO (no los vuelvas a preguntar):',
    );
    if (known.contactName)
      lines.push(`- nombre en el chat: ${known.contactName}`);
    lines.push(...known_);
  }
  return lines.join('\n');
}

/** Herramientas del flujo para el agente (formato OpenAI / OpenRouter). */
export function buildAgentTools(config: FlowAgentConfig): any[] {
  const outcomes = config.outcomes.filter((o) => o.id && o.name);
  const tools: any[] = [
    {
      type: 'function',
      function: {
        name: FINISH_TOOL,
        description:
          'Termina este tramo de la conversación con uno de los resultados definidos.',
        parameters: {
          type: 'object',
          properties: {
            outcome: {
              type: 'string',
              enum: outcomes.map((o) => o.id),
              description: 'id del resultado al que llegó la conversación',
            },
            summary: {
              type: 'string',
              description: 'Resumen breve de la conversación para el equipo',
            },
            message: {
              type: 'string',
              description: 'Último mensaje para el contacto (opcional)',
            },
          },
          required: ['outcome'],
        },
      },
    },
  ];
  const collect = (config.collect || []).filter(
    (c) => c.variable && c.description,
  );
  if (collect.length) {
    tools.push({
      type: 'function',
      function: {
        name: SAVE_TOOL,
        description:
          'Guarda datos que el contacto dio explícitamente en la conversación.',
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            collect.map((c) => [
              c.variable,
              { type: 'string', description: c.description },
            ]),
          ),
        },
      },
    });
  }
  if (config.allowHandoff !== false) {
    tools.push({
      type: 'function',
      function: {
        name: HANDOFF_TOOL,
        description: 'Transfiere la conversación a un agente humano.',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Motivo' },
            message: {
              type: 'string',
              description:
                'Mensaje para el contacto antes de transferir (opcional)',
            },
          },
        },
      },
    });
  }
  return tools;
}

/** El resultado elegido por la IA: por id o, si se equivoca, por nombre. */
export function matchOutcome(
  outcomes: FlowAgentOutcome[],
  raw: unknown,
): FlowAgentOutcome | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return null;
  return (
    outcomes.find((o) => o.id === s) ??
    outcomes.find((o) => normalizeText(o.name) === normalizeText(s)) ??
    null
  );
}

const cleanText = (v: unknown, max: number) =>
  typeof v === 'string' || typeof v === 'number'
    ? String(v).trim().slice(0, max)
    : '';

export interface AgentTurn {
  /** Respuesta para el contacto (vacía si la IA terminó sin escribir nada) */
  reply: string;
  finish?: { outcome: FlowAgentOutcome; summary: string };
  handoff?: { reason: string };
  /** Datos que la IA guardó con save_data (solo variables configuradas) */
  saved: Record<string, string>;
}

/** Interpreta la respuesta y las llamadas a herramientas de un turno. */
export function interpretAgentTurn(
  config: FlowAgentConfig,
  content: string,
  calls: { name: string; args: Record<string, unknown> }[],
): AgentTurn {
  const allowed = new Set((config.collect || []).map((c) => c.variable));
  const turn: AgentTurn = { reply: cleanText(content, 4000), saved: {} };
  const extraMessages: string[] = [];
  for (const call of calls) {
    if (call.name === SAVE_TOOL) {
      for (const [k, v] of Object.entries(call.args || {})) {
        const value = cleanText(v, 500);
        if (allowed.has(k) && value) turn.saved[k] = value;
      }
    } else if (call.name === FINISH_TOOL && !turn.finish && !turn.handoff) {
      const outcome = matchOutcome(config.outcomes, call.args?.outcome);
      if (outcome) {
        turn.finish = { outcome, summary: cleanText(call.args?.summary, 1000) };
        const msg = cleanText(call.args?.message, 2000);
        if (msg) extraMessages.push(msg);
      }
    } else if (
      call.name === HANDOFF_TOOL &&
      config.allowHandoff !== false &&
      !turn.finish &&
      !turn.handoff
    ) {
      turn.handoff = { reason: cleanText(call.args?.reason, 500) };
      const msg = cleanText(call.args?.message, 2000);
      if (msg) extraMessages.push(msg);
    }
  }
  // Mensaje final de la herramienta: se usa si la IA no escribió otro igual.
  for (const m of extraMessages) {
    if (!turn.reply) turn.reply = m;
    else if (normalizeText(m) !== normalizeText(turn.reply))
      turn.reply = `${turn.reply}\n\n${m}`;
  }
  return turn;
}

/** Añade un mensaje al historial del tramo conservando solo los más recientes. */
export function pushHistory(
  history: { role: 'user' | 'assistant'; content: string }[],
  role: 'user' | 'assistant',
  content: string,
): { role: 'user' | 'assistant'; content: string }[] {
  const text = content.trim().slice(0, AGENT_MESSAGE_MAX);
  if (!text) return history;
  const next = [...history, { role, content: text }];
  // El historial debe empezar por el contacto o la IA, nunca a medias de un par.
  return next.slice(-AGENT_HISTORY_LIMIT);
}
