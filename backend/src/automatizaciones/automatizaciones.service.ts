import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Automation } from './automation.entity';
import { AutomationRun } from './automation-run.entity';
import {
  AutomationConnection,
  CONNECTION_FIELDS,
  ConnectionType,
} from './automation-connection.entity';
import { AutomationEngine } from './automation-engine.service';
import { AutomationDispatcher } from './automation-dispatcher.service';
import { AutomationCrmService } from './automation-crm.service';
import {
  CreateAutomationDto,
  SaveConnectionDto,
  UpdateAutomationDto,
} from './dto/automation.dto';
import {
  decryptJson,
  encryptJson,
  generateWebhookToken,
} from './utils/automation-crypto.util';
import { lastCronTick, validateGraph } from './utils/graph-validator.util';

const MAX_NODES = 200;
const MAX_CONCURRENT_PER_AUTOMATION = 5;

@Injectable()
export class AutomatizacionesService {
  private readonly logger = new Logger(AutomatizacionesService.name);
  /** Ejecuciones en curso por automatización (límite de concurrencia). */
  private readonly inFlight = new Map<string, number>();

  constructor(
    @InjectRepository(Automation)
    private readonly repo: Repository<Automation>,
    @InjectRepository(AutomationRun)
    private readonly runRepo: Repository<AutomationRun>,
    @InjectRepository(AutomationConnection)
    private readonly connRepo: Repository<AutomationConnection>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly engine: AutomationEngine,
    private readonly dispatcher: AutomationDispatcher,
    private readonly crm: AutomationCrmService,
  ) {}

  // ─── CRUD de automatizaciones ──────────────────────────────────

  private toView(a: Automation) {
    const trigger = a.nodes?.find((n) => n.type.startsWith('trigger_'));
    return {
      id: a.id,
      tenantId: a.tenantId,
      name: a.name,
      description: a.description,
      status: a.status,
      nodes: a.nodes,
      edges: a.edges,
      settings: a.settings,
      webhookToken: a.webhookToken,
      triggerType: trigger?.type ?? null,
      nodeCount: a.nodes?.length ?? 0,
      runCount: a.runCount,
      lastRunAt: a.lastRunAt,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }

  async findAll(tenantId: string) {
    const list = await this.repo.find({
      where: { tenantId },
      order: { updatedAt: 'DESC' },
    });
    // El listado no necesita el grafo completo.
    return list.map((a) => {
      const { nodes, edges, ...rest } = this.toView(a);
      void nodes;
      void edges;
      return rest;
    });
  }

  private async getOwned(id: string, tenantId: string): Promise<Automation> {
    const a = await this.repo.findOne({ where: { id, tenantId } });
    if (!a) throw new NotFoundException('Automatización no encontrada');
    return a;
  }

  async findOne(id: string, tenantId: string) {
    return this.toView(await this.getOwned(id, tenantId));
  }

  async create(dto: CreateAutomationDto) {
    if (!dto.name?.trim()) throw new BadRequestException('El nombre es obligatorio');
    const a = await this.repo.save(
      this.repo.create({
        tenantId: dto.tenantId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        status: 'draft',
        nodes: [
          {
            id: 'trigger-1',
            type: 'trigger_manual',
            position: { x: 80, y: 160 },
            data: { label: 'Inicio manual' },
          },
        ],
        edges: [],
        settings: { timezone: 'America/Mexico_City' },
        webhookToken: generateWebhookToken(),
      }),
    );
    return this.toView(a);
  }

  async update(id: string, dto: UpdateAutomationDto) {
    const a = await this.getOwned(id, dto.tenantId);

    if (dto.nodes && dto.nodes.length > MAX_NODES) {
      throw new BadRequestException(`Máximo ${MAX_NODES} nodos por automatización`);
    }
    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('El nombre es obligatorio');
      a.name = dto.name.trim();
    }
    if (dto.description !== undefined) a.description = dto.description?.trim() || null;
    if (dto.nodes) a.nodes = this.sanitizeNodes(dto.nodes);
    if (dto.edges) a.edges = dto.edges.map((e) => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle ?? null,
      target: e.target,
    }));
    if (dto.settings !== undefined) a.settings = dto.settings;

    const nextStatus = dto.status ?? a.status;
    if (nextStatus === 'active') {
      const issues = validateGraph(a.nodes, a.edges);
      if (issues.length) {
        throw new BadRequestException({
          message: 'No se puede activar: hay problemas en el flujo',
          issues,
        });
      }
    }
    a.status = nextStatus;
    return this.toView(await this.repo.save(a));
  }

  private sanitizeNodes(nodes: Automation['nodes']): Automation['nodes'] {
    return nodes.map((n) => ({
      id: String(n.id),
      type: n.type,
      position: {
        x: Number(n.position?.x) || 0,
        y: Number(n.position?.y) || 0,
      },
      data: n.data && typeof n.data === 'object' ? n.data : {},
    }));
  }

  async remove(id: string, tenantId: string) {
    const a = await this.getOwned(id, tenantId);
    await this.runRepo.delete({ automationId: a.id });
    await this.repo.remove(a);
  }

  async duplicate(id: string, tenantId: string) {
    const a = await this.getOwned(id, tenantId);
    const copy = await this.repo.save(
      this.repo.create({
        tenantId,
        name: `${a.name} (copia)`.slice(0, 255),
        description: a.description,
        status: 'draft',
        nodes: JSON.parse(JSON.stringify(a.nodes)),
        edges: JSON.parse(JSON.stringify(a.edges)),
        settings: a.settings,
        webhookToken: generateWebhookToken(),
      }),
    );
    return this.toView(copy);
  }

  async rotateWebhookToken(id: string, tenantId: string) {
    const a = await this.getOwned(id, tenantId);
    a.webhookToken = generateWebhookToken();
    return this.toView(await this.repo.save(a));
  }

  // ─── Ejecución ─────────────────────────────────────────────────

  private async withSlot<T>(automationId: string, fn: () => Promise<T>): Promise<T> {
    const current = this.inFlight.get(automationId) ?? 0;
    if (current >= MAX_CONCURRENT_PER_AUTOMATION) {
      throw new HttpException(
        'Demasiadas ejecuciones simultáneas de esta automatización',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.inFlight.set(automationId, current + 1);
    try {
      return await fn();
    } finally {
      const left = (this.inFlight.get(automationId) ?? 1) - 1;
      if (left <= 0) this.inFlight.delete(automationId);
      else this.inFlight.set(automationId, left);
    }
  }

  /** Ejecución manual / de prueba desde el editor (usa el grafo guardado). */
  async runManual(id: string, tenantId: string, input?: Record<string, unknown>) {
    const a = await this.getOwned(id, tenantId);
    const start = a.nodes.find((n) => n.type.startsWith('trigger_'));
    if (!start) throw new BadRequestException('La automatización no tiene disparador');
    const type = start.type === 'trigger_manual' ? 'manual' : 'test';
    // Las pruebas desde el editor no consumen créditos.
    return this.withSlot(a.id, () =>
      this.engine.execute(a, type, input ?? {}, undefined, { billable: false }),
    );
  }

  /** Entrada pública: POST/GET /automatizaciones/hooks/:token */
  async handleWebhook(
    token: string,
    payload: {
      body: unknown;
      query: unknown;
      headers: Record<string, unknown>;
      method: string;
    },
    wait: boolean,
  ) {
    if (!/^[a-f0-9]{48}$/.test(token)) throw new NotFoundException();
    const a = await this.repo.findOne({ where: { webhookToken: token } });
    // Misma respuesta si no existe o está apagada: no filtra información.
    if (!a || a.status !== 'active') throw new NotFoundException();
    if (!(await this.moduleEnabled(a.tenantId))) throw new NotFoundException();

    const trigger = a.nodes.find((n) => n.type === 'trigger_webhook');
    if (!trigger) throw new NotFoundException();

    const allowed = String(trigger.data?.method || 'ANY').toUpperCase();
    if (allowed !== 'ANY' && allowed !== payload.method) {
      throw new HttpException('Método no permitido', HttpStatus.METHOD_NOT_ALLOWED);
    }
    // Secreto opcional por cabecera para endurecer el webhook.
    const secret = trigger.data?.secret ? String(trigger.data.secret) : '';
    if (secret && payload.headers['x-webhook-secret'] !== secret) {
      throw new ForbiddenException('Secreto inválido');
    }

    const triggerData = {
      body: payload.body,
      query: payload.query,
      headers: {
        'content-type': payload.headers['content-type'],
        'user-agent': payload.headers['user-agent'],
      },
      method: payload.method,
    };

    if (wait) {
      // Modo síncrono: se ejecuta en línea para devolver el resultado.
      const run = await this.withSlot(a.id, () =>
        this.engine.execute(a, 'webhook', triggerData, trigger.id),
      );
      return { runId: run.id, status: run.status, result: run.result, error: run.error };
    }
    // Modo asíncrono: se encola (sobrevive a reinicios) y se responde 202.
    await this.dispatcher.enqueue(a, 'webhook', triggerData, trigger.id);
    return { accepted: true };
  }

  private moduleEnabled(tenantId: string): Promise<boolean> {
    return this.dispatcher.moduleEnabled(tenantId);
  }

  // ─── Programador (cron) ────────────────────────────────────────

  @Cron('0 * * * * *')
  async tickSchedules() {
    if (process.env.AUTOMATION_SCHEDULER_ENABLED === 'false') return;
    const now = new Date();
    const list = await this.repo.find({ where: { status: 'active' } });
    for (const a of list) {
      const trigger = a.nodes?.find((n) => n.type === 'trigger_schedule');
      if (!trigger?.data?.cron) continue;
      const tz = a.settings?.timezone || 'UTC';
      const tick = lastCronTick(String(trigger.data.cron), tz, now);
      if (!tick) continue;
      if (a.lastScheduledAt && a.lastScheduledAt.getTime() >= tick.getTime()) continue;
      if (!(await this.moduleEnabled(a.tenantId))) continue;

      // Marca primero para que otro tick/instancia no dispare el mismo minuto.
      await this.repo.update({ id: a.id }, { lastScheduledAt: tick });
      await this.dispatcher
        .enqueue(a, 'schedule', { scheduledAt: tick.toISOString() }, trigger.id)
        .catch((e) =>
          this.logger.error(`Schedule enqueue falló (${a.id}): ${(e as Error).message}`),
        );
    }
  }

  listInboxes(tenantId: string) {
    return this.crm.listInboxes(tenantId);
  }

  // ─── Historial ─────────────────────────────────────────────────

  async listRuns(automationId: string, tenantId: string, limit = 30) {
    await this.getOwned(automationId, tenantId);
    const take = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const runs = await this.runRepo.find({
      where: { automationId, tenantId },
      order: { startedAt: 'DESC' },
      take,
    });
    // Sin pasos en el listado.
    return runs.map(({ steps, ...r }) => ({ ...r, stepCount: steps?.length ?? 0 }));
  }

  async listTenantRuns(tenantId: string, limit = 50) {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const runs = await this.runRepo.find({
      where: { tenantId },
      order: { startedAt: 'DESC' },
      take,
    });
    const autos = await this.repo.find({ where: { tenantId }, select: { id: true, name: true } });
    const names = new Map(autos.map((a) => [a.id, a.name]));
    return runs.map(({ steps, ...r }) => ({
      ...r,
      stepCount: steps?.length ?? 0,
      automationName: names.get(r.automationId) ?? 'Eliminada',
    }));
  }

  async getRun(runId: string, tenantId: string) {
    const run = await this.runRepo.findOne({ where: { id: runId, tenantId } });
    if (!run) throw new NotFoundException('Ejecución no encontrada');
    return run;
  }

  // ─── Conexiones ────────────────────────────────────────────────

  getConnectionTypes() {
    return Object.entries(CONNECTION_FIELDS).map(([type, def]) => ({
      type,
      ...def,
    }));
  }

  /** Nunca devuelve secretos: solo los campos no secretos y qué secretos existen. */
  private connView(c: AutomationConnection) {
    const def = CONNECTION_FIELDS[c.type];
    let data: Record<string, string> = {};
    try {
      data = decryptJson(c.data);
    } catch {
      /* clave rotada o dato corrupto */
    }
    const visible: Record<string, string> = {};
    const secretsSet: string[] = [];
    for (const f of def?.fields ?? []) {
      if (f.secret) {
        if (data[f.key]) secretsSet.push(f.key);
      } else if (data[f.key] !== undefined) visible[f.key] = data[f.key];
    }
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      visible,
      secretsSet,
      updatedAt: c.updatedAt,
    };
  }

  async listConnections(tenantId: string) {
    const list = await this.connRepo.find({
      where: { tenantId },
      order: { name: 'ASC' },
    });
    return list.map((c) => this.connView(c));
  }

  private cleanConnectionData(type: ConnectionType, raw: Record<string, string>) {
    const def = CONNECTION_FIELDS[type];
    if (!def) throw new BadRequestException('Tipo de conexión no soportado');
    const out: Record<string, string> = {};
    for (const f of def.fields) {
      const v = raw?.[f.key];
      if (typeof v === 'string') out[f.key] = v.trim().slice(0, 2000);
    }
    return out;
  }

  async createConnection(dto: SaveConnectionDto) {
    if (!dto.name?.trim()) throw new BadRequestException('El nombre es obligatorio');
    if (!dto.type || !CONNECTION_FIELDS[dto.type]) {
      throw new BadRequestException('Tipo de conexión no soportado');
    }
    const data = this.cleanConnectionData(dto.type, dto.data);
    const missing = CONNECTION_FIELDS[dto.type].fields.filter(
      (f) => f.secret && !data[f.key],
    );
    if (missing.length) {
      throw new BadRequestException(`Falta: ${missing.map((m) => m.label).join(', ')}`);
    }
    const c = await this.connRepo.save(
      this.connRepo.create({
        tenantId: dto.tenantId,
        name: dto.name.trim(),
        type: dto.type,
        data: encryptJson(data),
      }),
    );
    return this.connView(c);
  }

  async updateConnection(id: string, dto: SaveConnectionDto) {
    const c = await this.connRepo.findOne({ where: { id, tenantId: dto.tenantId } });
    if (!c) throw new NotFoundException('Conexión no encontrada');
    const current = decryptJson<Record<string, string>>(c.data);
    const incoming = this.cleanConnectionData(c.type, dto.data);
    // Los campos vacíos conservan el valor existente (para no reenviar secretos).
    const merged = { ...current };
    for (const [k, v] of Object.entries(incoming)) if (v) merged[k] = v;
    if (dto.name?.trim()) c.name = dto.name.trim();
    c.data = encryptJson(merged);
    return this.connView(await this.connRepo.save(c));
  }

  async removeConnection(id: string, tenantId: string) {
    const c = await this.connRepo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException('Conexión no encontrada');
    await this.connRepo.remove(c);
  }
}
