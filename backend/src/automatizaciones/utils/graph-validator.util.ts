import * as parser from 'cron-parser';
import { AutomationEdge, AutomationNode } from '../automation.entity';

const TRIGGERS = [
  'trigger_manual',
  'trigger_webhook',
  'trigger_schedule',
  'trigger_contact_created',
  'trigger_message_received',
  'trigger_conversation_created',
];

const KNOWN_TYPES = new Set([
  ...TRIGGERS,
  'condition',
  'loop',
  'set_variable',
  'delay',
  'stop',
  'http_request',
  'send_email',
  'slack',
  'discord',
  'telegram',
  'ai_prompt',
  'send_message',
  'contact_upsert',
  'contact_find',
]);

export interface GraphIssue {
  nodeId?: string;
  message: string;
}

const empty = (v: unknown) => v === undefined || v === null || String(v).trim() === '';

/**
 * Valida estructura y configuración mínima del grafo. Se usa al activar una
 * automatización: guardar borradores incompletos siempre está permitido.
 */
export function validateGraph(
  nodes: AutomationNode[],
  edges: AutomationEdge[],
): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const ids = new Set(nodes.map((n) => n.id));

  const triggers = nodes.filter((n) => TRIGGERS.includes(n.type));
  if (triggers.length === 0) {
    issues.push({ message: 'Falta un disparador' });
  } else if (triggers.length > 1) {
    issues.push({ message: 'Solo puede haber un disparador por automatización' });
  }

  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) {
      issues.push({ message: 'Hay conexiones que apuntan a nodos inexistentes' });
      break;
    }
  }

  // Alcanzabilidad desde el disparador.
  if (triggers.length === 1) {
    const seen = new Set<string>();
    const stack = [triggers[0].id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const e of edges) if (e.source === cur) stack.push(e.target);
    }
    for (const n of nodes) {
      if (!seen.has(n.id)) {
        issues.push({
          nodeId: n.id,
          message: `«${(n.data?.label as string) || n.type}» no está conectado al disparador`,
        });
      }
    }
  }

  for (const n of nodes) {
    const label = (n.data?.label as string) || n.type;
    const d = n.data || {};
    const need = (cond: boolean, msg: string) => {
      if (!cond) issues.push({ nodeId: n.id, message: `«${label}»: ${msg}` });
    };

    if (!KNOWN_TYPES.has(n.type)) {
      issues.push({ nodeId: n.id, message: `Tipo de nodo desconocido: ${n.type}` });
      continue;
    }
    switch (n.type) {
      case 'trigger_schedule':
        if (empty(d.cron)) need(false, 'falta la expresión cron');
        else {
          try {
            parser.parseExpression(String(d.cron));
          } catch {
            need(false, 'expresión cron inválida');
          }
        }
        break;
      case 'http_request':
        need(!empty(d.url), 'falta la URL');
        break;
      case 'send_email':
        need(!empty(d.to), 'falta el destinatario');
        need(!empty(d.subject), 'falta el asunto');
        break;
      case 'slack':
      case 'discord':
        need(!empty(d.connectionId), 'selecciona una conexión');
        need(!empty(d.text), 'falta el mensaje');
        break;
      case 'telegram':
        need(!empty(d.connectionId), 'selecciona una conexión');
        need(!empty(d.chatId), 'falta el chat');
        need(!empty(d.text), 'falta el mensaje');
        break;
      case 'ai_prompt':
        need(!empty(d.prompt), 'falta el prompt');
        break;
      case 'send_message':
        need(!empty(d.inboxId), 'selecciona un canal');
        need(!empty(d.text), 'falta el mensaje');
        need(
          !empty(d.phone) || !empty(d.email) || !empty(d.recordId),
          'indica el destinatario (teléfono, email o id de contacto)',
        );
        break;
      case 'contact_upsert':
      case 'contact_find':
        need(!empty(d.phone) || !empty(d.email), 'indica un teléfono o un email');
        break;
      case 'loop':
        need(!empty(d.items), 'falta la lista a recorrer');
        break;
      case 'condition':
        need(Array.isArray(d.branches) && d.branches.length > 0, 'agrega al menos una rama');
        break;
      case 'delay': {
        const ms = (Number(d.amount) || 0) * (d.unit === 'minutes' ? 60000 : 1000);
        need(ms <= 5 * 60 * 1000, 'la espera máxima es de 5 minutos');
        break;
      }
      default:
        break;
    }
  }

  return issues;
}

/** Verifica que `expr` haya debido dispararse en el último minuto. */
export function lastCronTick(
  expr: string,
  tz: string,
  now: Date,
): Date | null {
  try {
    const it = parser.parseExpression(expr, { currentDate: now, tz });
    const prev = it.prev().toDate();
    return now.getTime() - prev.getTime() < 60_000 ? prev : null;
  } catch {
    return null;
  }
}
