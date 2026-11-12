import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { BillingService } from '../billing/billing.service';
import { AutomationCrmService } from './automation-crm.service';
import { automationContext } from './utils/automation-context';
import {
  Automation,
  AutomationEdge,
  AutomationNode,
} from './automation.entity';
import {
  AutomationRun,
  AutomationStepLog,
} from './automation-run.entity';
import { AutomationConnection } from './automation-connection.entity';
import { decryptJson } from './utils/automation-crypto.util';
import { safeFetch } from './utils/safe-fetch.util';
import {
  getPath,
  renderDeep,
  renderString,
  renderText,
  TemplateContext,
} from './utils/template.util';
import { ConditionBranch, evaluateBranch } from './utils/condition.util';

const MAX_STEPS = 500;
const MAX_RUN_MS = 5 * 60 * 1000;
const MAX_LOOP_ITEMS = 1000;
const MAX_DELAY_MS = 5 * 60 * 1000;
const LOG_LIMIT = 4000;
const CREDIT_ACTION = 'automation_run';

/** Señal para terminar la ejecución desde un nodo «Detener». */
class StopSignal extends Error {
  constructor(
    public readonly ok: boolean,
    message: string,
  ) {
    super(message);
  }
}

interface KeyValue {
  key: string;
  value: string;
}

interface NodeResult {
  output: unknown;
  /** Salida a seguir; por defecto 'next'. */
  handle?: string;
  /** Entrada ya resuelta, para el registro de ejecución. */
  input?: unknown;
}

interface RunState {
  automation: Automation;
  run: AutomationRun;
  ctx: TemplateContext & {
    trigger: unknown;
    vars: Record<string, unknown>;
    steps: Record<string, unknown>;
    now: string;
  };
  nodes: Map<string, AutomationNode>;
  edges: AutomationEdge[];
  stepCount: number;
  deadline: number;
  lastOutput: unknown;
  connCache: Map<string, Record<string, string>>;
  /** Iteración actual del bucle más interno (para el registro). */
  iteration?: number;
}

function truncate(value: unknown): unknown {
  if (value === undefined) return undefined;
  let s: string;
  try {
    s = JSON.stringify(value);
  } catch {
    return String(value).slice(0, LOG_LIMIT);
  }
  if (s === undefined) return undefined;
  if (s.length <= LOG_LIMIT) return value;
  return s.slice(0, LOG_LIMIT) + '…';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function kvToObject(list: unknown, ctx: TemplateContext): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(list)) return out;
  for (const item of list as KeyValue[]) {
    if (!item?.key) continue;
    out[renderText(item.key, ctx)] = renderText(item.value, ctx);
  }
  return out;
}

@Injectable()
export class AutomationEngine {
  private readonly logger = new Logger(AutomationEngine.name);

  constructor(
    @InjectRepository(AutomationRun)
    private readonly runRepo: Repository<AutomationRun>,
    @InjectRepository(AutomationConnection)
    private readonly connRepo: Repository<AutomationConnection>,
    @InjectRepository(Automation)
    private readonly automationRepo: Repository<Automation>,
    private readonly mail: MailService,
    private readonly billing: BillingService,
    private readonly crm: AutomationCrmService,
  ) {}

  /**
   * Ejecuta una automatización de principio a fin y persiste el registro.
   * No lanza: los errores quedan en el run (status = 'error').
   */
  async execute(
    automation: Automation,
    triggerType: string,
    triggerData: unknown,
    startNodeId?: string,
    opts: { billable?: boolean } = {},
  ): Promise<AutomationRun> {
    // El contexto asíncrono evita que los cambios del propio flujo lo re-disparen.
    return automationContext.run({ automationId: automation.id }, () =>
      this.executeInner(automation, triggerType, triggerData, startNodeId, opts),
    );
  }

  /** Cobra el costo configurado (acción `automation_run`); sin costo = gratis. */
  private async charge(automation: Automation, runId: string): Promise<string | null> {
    try {
      const cost = await this.billing.getEffectiveActionCost(
        automation.tenantId,
        CREDIT_ACTION,
      );
      if (cost === null || Number(cost) <= 0) return null;
      await this.billing.consumeByAction(automation.tenantId, CREDIT_ACTION, runId);
      return null;
    } catch (err) {
      const msg = (err as Error).message || '';
      return /insuficientes/i.test(msg)
        ? 'Créditos insuficientes para ejecutar la automatización'
        : `No se pudo cobrar la ejecución: ${msg}`;
    }
  }

  private async executeInner(
    automation: Automation,
    triggerType: string,
    triggerData: unknown,
    startNodeId: string | undefined,
    opts: { billable?: boolean },
  ): Promise<AutomationRun> {
    const started = Date.now();
    const run = await this.runRepo.save(
      this.runRepo.create({
        tenantId: automation.tenantId,
        automationId: automation.id,
        status: 'running',
        triggerType,
        triggerData: truncate(triggerData),
        steps: [],
      }),
    );

    const state: RunState = {
      automation,
      run,
      ctx: {
        trigger: triggerData ?? {},
        vars: {},
        steps: {},
        now: new Date().toISOString(),
      },
      nodes: new Map(automation.nodes.map((n) => [n.id, n])),
      edges: automation.edges,
      stepCount: 0,
      deadline: started + MAX_RUN_MS,
      lastOutput: undefined,
      connCache: new Map(),
    };

    // Las pruebas desde el editor (billable = false) no consumen créditos.
    if (opts.billable !== false) {
      const chargeError = await this.charge(automation, run.id);
      if (chargeError) {
        run.status = 'error';
        run.error = chargeError;
        run.finishedAt = new Date();
        run.durationMs = Date.now() - started;
        return this.runRepo.save(run);
      }
    }

    try {
      const start =
        (startNodeId && state.nodes.get(startNodeId)) ||
        automation.nodes.find((n) => n.type.startsWith('trigger_'));
      if (!start) throw new Error('La automatización no tiene disparador');
      await this.visit(start.id, state);
      run.status = 'success';
    } catch (err) {
      if (err instanceof StopSignal) {
        run.status = err.ok ? 'success' : 'error';
        run.error = err.ok ? null : err.message;
      } else {
        run.status = 'error';
        run.error = (err as Error).message || 'Error desconocido';
      }
    }

    run.result = truncate(state.lastOutput);
    run.finishedAt = new Date();
    run.durationMs = Date.now() - started;
    const saved = await this.runRepo.save(run);
    await this.automationRepo
      .update(
        { id: automation.id },
        { runCount: () => 'run_count + 1', lastRunAt: new Date() },
      )
      .catch(() => undefined);
    return saved;
  }

  // ─── Recorrido del grafo ───────────────────────────────────────

  private targets(state: RunState, nodeId: string, handle: string): string[] {
    return state.edges
      .filter(
        (e) =>
          e.source === nodeId && (e.sourceHandle || 'next') === handle,
      )
      .map((e) => e.target);
  }

  private async follow(state: RunState, nodeId: string, handle: string) {
    for (const t of this.targets(state, nodeId, handle)) {
      await this.visit(t, state);
    }
  }

  private async visit(nodeId: string, state: RunState): Promise<void> {
    const node = state.nodes.get(nodeId);
    if (!node) return;

    if (++state.stepCount > MAX_STEPS) {
      throw new Error(`Se superó el máximo de ${MAX_STEPS} pasos por ejecución`);
    }
    if (Date.now() > state.deadline) {
      throw new Error('Se superó el tiempo máximo de ejecución (5 min)');
    }

    const label = (node.data?.label as string) || node.type;
    const startedAt = new Date();
    const t0 = Date.now();
    const retries = Math.min(Math.max(Number(node.data?.retries) || 0, 0), 5);
    let attempts = 0;
    let result: NodeResult | undefined;
    let lastError: Error | undefined;

    // Los bucles gestionan sus propias iteraciones, sin reintentos.
    const maxAttempts = node.type === 'loop' ? 1 : retries + 1;
    while (attempts < maxAttempts) {
      attempts++;
      try {
        result = await this.runNode(node, state);
        lastError = undefined;
        break;
      } catch (err) {
        if (err instanceof StopSignal) {
          this.pushStep(state, node, label, startedAt, t0, attempts, {
            status: err.ok ? 'success' : 'error',
            output: { stopped: true, message: err.message },
            error: err.ok ? undefined : err.message,
          });
          throw err;
        }
        lastError = err as Error;
        if (attempts < maxAttempts) await sleep(Math.min(500 * 2 ** attempts, 5000));
      }
    }

    if (lastError || !result) {
      const message = lastError?.message || 'Error desconocido';
      this.pushStep(state, node, label, startedAt, t0, attempts, {
        status: 'error',
        error: message,
      });
      state.ctx.steps[node.id] = { error: message };
      if (node.data?.onError === 'continue') {
        await this.follow(state, node.id, 'error');
        return;
      }
      throw new Error(`«${label}»: ${message}`);
    }

    state.ctx.steps[node.id] = { output: result.output };
    state.lastOutput = result.output;
    this.pushStep(state, node, label, startedAt, t0, attempts, {
      status: 'success',
      input: result.input,
      output: result.output,
    });

    if (node.type === 'loop') {
      await this.runLoop(node, state, result.output);
      return;
    }
    await this.follow(state, node.id, result.handle || 'next');
  }

  private async runLoop(node: AutomationNode, state: RunState, output: unknown) {
    const items = (output as { items: unknown[] }).items;
    const prevItem = state.ctx.vars.item;
    const prevIndex = state.ctx.vars.index;
    const prevIteration = state.iteration;
    for (let i = 0; i < items.length; i++) {
      state.ctx.vars.item = items[i];
      state.ctx.vars.index = i;
      state.iteration = i + 1;
      await this.follow(state, node.id, 'each');
    }
    state.ctx.vars.item = prevItem;
    state.ctx.vars.index = prevIndex;
    state.iteration = prevIteration;
    await this.follow(state, node.id, 'done');
  }

  private pushStep(
    state: RunState,
    node: AutomationNode,
    label: string,
    startedAt: Date,
    t0: number,
    attempts: number,
    extra: Partial<AutomationStepLog>,
  ) {
    const step: AutomationStepLog = {
      nodeId: node.id,
      type: node.type,
      label,
      status: 'success',
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - t0,
      attempts,
      iteration: state.iteration,
      ...extra,
      input: truncate(extra.input),
      output: truncate(extra.output),
    };
    // Tope de pasos registrados para no inflar el JSONB en bucles grandes.
    if (state.run.steps.length < 300) state.run.steps.push(step);
  }

  // ─── Ejecutores por tipo de nodo ───────────────────────────────

  private async runNode(node: AutomationNode, state: RunState): Promise<NodeResult> {
    const d = node.data || {};
    const ctx = state.ctx;

    switch (node.type) {
      case 'trigger_manual':
      case 'trigger_webhook':
      case 'trigger_schedule':
      case 'trigger_contact_created':
      case 'trigger_message_received':
      case 'trigger_conversation_created':
        return { output: ctx.trigger };

      case 'send_message':
        return this.crm.sendMessage(state.automation.tenantId, d, ctx);
      case 'contact_upsert':
        return this.crm.upsertContact(state.automation.tenantId, d, ctx);
      case 'contact_find':
        return this.crm.findContact(state.automation.tenantId, d, ctx);

      case 'set_variable': {
        const list = (d.assignments as { name: string; value: string; type?: string }[]) || [];
        const out: Record<string, unknown> = {};
        for (const a of list) {
          if (!a?.name) continue;
          out[a.name] = this.coerce(renderString(a.value ?? '', ctx), a.type);
          ctx.vars[a.name] = out[a.name];
        }
        return { output: out };
      }

      case 'condition': {
        const branches = (d.branches as ConditionBranch[]) || [];
        for (const b of branches) {
          if (evaluateBranch(b, ctx)) {
            return {
              output: { matched: b.label || b.id },
              handle: `cond:${b.id}`,
            };
          }
        }
        return { output: { matched: 'else' }, handle: 'else' };
      }

      case 'loop': {
        const raw = renderString(String(d.items ?? ''), ctx);
        let items: unknown = raw;
        if (typeof raw === 'string') {
          try {
            items = JSON.parse(raw);
          } catch {
            items = raw.split(/\r?\n/).filter(Boolean);
          }
        }
        if (!Array.isArray(items)) {
          throw new Error('El campo «Lista» no resolvió a un arreglo');
        }
        const limited = items.slice(0, MAX_LOOP_ITEMS);
        return { output: { items: limited, count: limited.length } };
      }

      case 'delay': {
        const amount = Math.max(Number(d.amount) || 0, 0);
        const ms = amount * (d.unit === 'minutes' ? 60000 : 1000);
        if (ms > MAX_DELAY_MS) {
          throw new Error('La espera máxima por nodo es de 5 minutos');
        }
        await sleep(ms);
        return { output: { waitedMs: ms } };
      }

      case 'stop': {
        const msg = renderText(d.message || '', ctx);
        throw new StopSignal(d.mode !== 'error', msg || 'Detenido');
      }

      case 'http_request':
        return this.httpRequest(d, state);

      case 'send_email': {
        const to = renderText(d.to, ctx)
          .split(/[,;\s]+/)
          .filter(Boolean);
        if (to.length === 0) throw new Error('Falta el destinatario');
        if (to.length > 5) throw new Error('Máximo 5 destinatarios por correo');
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (to.some((a) => !emailRe.test(a))) throw new Error('Destinatario inválido');
        const subject = renderText(d.subject, ctx).replace(/[\r\n]+/g, ' ').slice(0, 300);
        const body = renderText(d.body, ctx);
        const input = { to, subject };
        await this.mail.sendRaw({
          to: to.join(','),
          subject,
          ...(d.html ? { html: body } : { text: body }),
          replyTo: d.replyTo ? renderText(d.replyTo, ctx) : undefined,
        });
        return { input, output: { sent: true, to } };
      }

      case 'slack':
      case 'discord': {
        const conn = await this.getConnection(state, d.connectionId as string, [
          node.type === 'slack' ? 'slack_webhook' : 'discord_webhook',
        ]);
        const text = renderText(d.text, ctx);
        if (!text) throw new Error('El mensaje está vacío');
        const payload =
          node.type === 'slack'
            ? { text }
            : { content: text.slice(0, 2000), username: d.username ? renderText(d.username, ctx) : undefined };
        const res = await safeFetch(conn.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`${node.type} respondió ${res.status}`);
        return { input: payload, output: { status: res.status, ok: true } };
      }

      case 'telegram': {
        const conn = await this.getConnection(state, d.connectionId as string, ['telegram_bot']);
        const payload = {
          chat_id: renderText(d.chatId, ctx),
          text: renderText(d.text, ctx),
          ...(d.parseMode ? { parse_mode: d.parseMode } : {}),
        };
        if (!payload.chat_id || !payload.text) {
          throw new Error('Faltan el chat o el mensaje');
        }
        const res = await safeFetch(
          `https://api.telegram.org/bot${encodeURIComponent(conn.botToken)}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
        );
        if (!res.ok) {
          const desc = (res.body as { description?: string })?.description;
          throw new Error(`Telegram respondió ${res.status}${desc ? `: ${desc}` : ''}`);
        }
        return { input: payload, output: res.body };
      }

      case 'ai_prompt': {
        const conn = d.connectionId
          ? await this.getConnection(state, d.connectionId as string, ['openrouter'])
          : { apiKey: process.env.OPENROUTER_API_KEY || '' };
        if (!conn.apiKey) throw new Error('No hay API key de IA configurada');
        const messages = [
          ...(d.system ? [{ role: 'system', content: renderText(d.system, ctx) }] : []),
          { role: 'user', content: renderText(d.prompt, ctx) },
        ];
        const body = {
          model: (d.model as string) || 'openai/gpt-4o-mini',
          temperature: Number(d.temperature ?? 0.3),
          messages,
        };
        const res = await safeFetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${conn.apiKey}`,
          },
          body: JSON.stringify(body),
          timeoutMs: 60000,
        });
        if (!res.ok) throw new Error(`IA respondió ${res.status}`);
        const text = getPath(res.body, 'choices[0].message.content');
        let parsed: unknown;
        if (d.parseJson && typeof text === 'string') {
          try {
            parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
          } catch {
            throw new Error('La IA no devolvió un JSON válido');
          }
        }
        return {
          input: { model: body.model, messages },
          output: { text, ...(parsed !== undefined ? { json: parsed } : {}) },
        };
      }

      default:
        throw new Error(`Tipo de nodo no soportado: ${node.type as string}`);
    }
  }

  private coerce(value: unknown, type?: string): unknown {
    switch (type) {
      case 'number': {
        const n = Number(value);
        return Number.isNaN(n) ? 0 : n;
      }
      case 'boolean':
        return value === true || String(value).toLowerCase() === 'true';
      case 'json':
        if (typeof value !== 'string') return value;
        try {
          return JSON.parse(value);
        } catch {
          throw new Error('Valor JSON inválido en «Definir variables»');
        }
      default:
        return typeof value === 'object' && value !== null
          ? value
          : value === undefined || value === null
            ? ''
            : String(value);
    }
  }

  private async httpRequest(
    d: Record<string, unknown>,
    state: RunState,
  ): Promise<NodeResult> {
    const ctx = state.ctx;
    const method = String(d.method || 'GET').toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      throw new Error(`Método no permitido: ${method}`);
    }
    const urlText = renderText(d.url, ctx).trim();
    if (!urlText) throw new Error('Falta la URL');
    const url = new URL(urlText);
    for (const [k, v] of Object.entries(kvToObject(d.query, ctx))) {
      url.searchParams.set(k, v);
    }

    const headers = kvToObject(d.headers, ctx);

    if (d.connectionId) {
      const c = await this.getConnection(state, d.connectionId as string, [
        'http_bearer',
        'http_basic',
        'http_api_key',
      ]);
      if (c.token) headers['Authorization'] = `Bearer ${c.token}`;
      else if (c.username !== undefined && c.password !== undefined) {
        headers['Authorization'] =
          'Basic ' + Buffer.from(`${c.username}:${c.password}`).toString('base64');
      } else if (c.apiKey) headers[c.headerName || 'X-API-Key'] = c.apiKey;
    }

    let body: string | undefined;
    const bodyType = String(d.bodyType || (method === 'GET' ? 'none' : 'json'));
    if (method !== 'GET' && bodyType !== 'none') {
      const raw = String(d.body ?? '');
      if (bodyType === 'json') {
        headers['Content-Type'] ??= 'application/json';
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = undefined;
        }
        // Si el JSON es válido se sustituye por valor (tipado y seguro);
        // si no, se sustituye como texto para permitir plantillas parciales.
        body =
          parsed !== undefined
            ? JSON.stringify(renderDeep(parsed, ctx))
            : renderText(raw, ctx);
      } else if (bodyType === 'form') {
        headers['Content-Type'] ??= 'application/x-www-form-urlencoded';
        body = new URLSearchParams(kvToObject(d.formFields, ctx)).toString();
      } else {
        headers['Content-Type'] ??= 'text/plain';
        body = renderText(raw, ctx);
      }
    }

    const timeoutMs = Math.min(Math.max(Number(d.timeoutSec) || 15, 1), 60) * 1000;
    const res = await safeFetch(url.toString(), { method, headers, body, timeoutMs });

    // Se oculta la cabecera de autorización en el registro.
    const { Authorization: _a, ...safeHeaders } = headers;
    void _a;
    const input = { method, url: url.toString(), headers: safeHeaders, body };

    if (!res.ok && d.failOnError !== false) {
      throw new Error(
        `HTTP ${res.status}: ${String(typeof res.body === 'string' ? res.body : JSON.stringify(res.body)).slice(0, 200)}`,
      );
    }
    return { input, output: { status: res.status, ok: res.ok, headers: res.headers, body: res.body } };
  }

  private async getConnection(
    state: RunState,
    id: string | undefined,
    allowed: string[],
  ): Promise<Record<string, string>> {
    if (!id) throw new Error('Selecciona una conexión');
    const cached = state.connCache.get(id);
    if (cached) return cached;
    const conn = await this.connRepo.findOne({
      where: { id, tenantId: state.automation.tenantId },
    });
    if (!conn) throw new Error('La conexión ya no existe');
    if (!allowed.includes(conn.type)) {
      throw new Error('El tipo de conexión no es compatible con este nodo');
    }
    const data = decryptJson<Record<string, string>>(conn.data);
    state.connCache.set(id, data);
    return data;
  }
}
