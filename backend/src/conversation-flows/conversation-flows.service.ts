import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ConversationFlow,
  FlowAction,
  FlowEdge,
  FlowNode,
  FlowNodeType,
  FlowTriggers,
} from './conversation-flow.entity';
import {
  CreateConversationFlowDto,
  UpdateConversationFlowDto,
} from './dto/conversation-flow.dto';

const NODE_TYPES = new Set<FlowNodeType>([
  'start',
  'message',
  'user_input',
  'action',
  'condition',
  'start_flow',
]);
const ACTION_TYPES = new Set<FlowAction['type']>([
  'set_variable',
  'add_label',
  'remove_label',
  'handoff',
  'resolve',
]);
const OPERATORS = new Set([
  'equals',
  'not_equals',
  'contains',
  'is_set',
  'is_not_set',
  'greater_than',
  'less_than',
]);
const VALIDATIONS = new Set(['any', 'number', 'email', 'phone']);
const VARIABLE_RE = /^[a-zA-Z_][\w]{0,49}$/;

/** Máximo de botones por mensaje (límite de las listas de WhatsApp). */
export const MAX_FLOW_BUTTONS = 10;
const MAX_BUTTON_TITLE = 24;
const MAX_NODES = 300;

@Injectable()
export class ConversationFlowsService {
  constructor(
    @InjectRepository(ConversationFlow)
    private readonly flowRepo: Repository<ConversationFlow>,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────

  findAll(tenantId: string): Promise<ConversationFlow[]> {
    if (!tenantId) throw new BadRequestException('tenantId es requerido');
    return this.flowRepo.find({
      where: { tenantId },
      order: { updatedAt: 'DESC' },
      // El listado no necesita el grafo completo.
      select: {
        id: true,
        tenantId: true,
        name: true,
        description: true,
        status: true,
        triggers: true,
        runCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findOne(id: string, tenantId: string): Promise<ConversationFlow> {
    if (!tenantId) throw new BadRequestException('tenantId es requerido');
    const flow = await this.flowRepo.findOne({ where: { id, tenantId } });
    if (!flow) throw new NotFoundException('Flujo no encontrado');
    return flow;
  }

  async create(dto: CreateConversationFlowDto): Promise<ConversationFlow> {
    const name = String(dto.name || '').trim();
    if (!name) throw new BadRequestException('El nombre es requerido');
    const flow = this.flowRepo.create({
      tenantId: dto.tenantId,
      name,
      description: dto.description?.trim() || null,
      status: 'draft',
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
      triggers: {
        keywords: [],
        matchType: 'exact',
        onNewConversation: false,
        inboxIds: [],
      },
    });
    return this.flowRepo.save(flow);
  }

  async update(
    id: string,
    dto: UpdateConversationFlowDto,
  ): Promise<ConversationFlow> {
    const flow = await this.findOne(id, dto.tenantId);

    if (dto.name !== undefined) {
      const name = String(dto.name).trim();
      if (!name) throw new BadRequestException('El nombre es requerido');
      flow.name = name;
    }
    if (dto.description !== undefined)
      flow.description = dto.description?.trim() || null;
    if (dto.nodes !== undefined)
      flow.nodes = await this.sanitizeNodes(dto.nodes, flow);
    // Las conexiones se revalidan siempre que cambian los nodos (pueden quedar huérfanas).
    if (dto.nodes !== undefined || dto.edges !== undefined) {
      flow.edges = this.sanitizeEdges(dto.edges ?? flow.edges, flow.nodes);
    }
    if (dto.triggers !== undefined)
      flow.triggers = this.sanitizeTriggers(dto.triggers);
    if (dto.status !== undefined) flow.status = dto.status;

    return this.flowRepo.save(flow);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const flow = await this.findOne(id, tenantId);
    await this.flowRepo.remove(flow);
  }

  async incrementRunCount(flowIds: string[]): Promise<void> {
    for (const id of new Set(flowIds)) {
      await this.flowRepo.increment({ id }, 'runCount', 1).catch(() => {});
    }
  }

  // ─── Ejecución ────────────────────────────────────────────────

  /** Carga un flujo del tenant (cualquier estado) para el motor. */
  loadForTenant(
    tenantId: string,
    flowId: string,
  ): Promise<ConversationFlow | null> {
    if (!flowId || !/^[0-9a-f-]{36}$/i.test(flowId))
      return Promise.resolve(null);
    return this.flowRepo.findOne({ where: { id: flowId, tenantId } });
  }

  /**
   * Busca el flujo activo que debe iniciarse con este mensaje:
   *   1) por palabra clave (prioridad), 2) por conversación nueva.
   */
  async findTriggeredFlow(
    tenantId: string,
    inboxId: string,
    text: string | null,
    isNewConversation: boolean,
  ): Promise<ConversationFlow | null> {
    const flows = await this.flowRepo.find({
      where: { tenantId, status: 'active' },
      order: { updatedAt: 'DESC' },
    });
    const applicable = flows.filter((f) => {
      const inboxIds = f.triggers?.inboxIds || [];
      return inboxIds.length === 0 || inboxIds.includes(inboxId);
    });

    const norm = normalize(text || '');
    if (norm) {
      const byKeyword = applicable.find((f) => {
        const t = f.triggers;
        if (!t?.keywords?.length) return false;
        return t.keywords.some((k) => {
          const kw = normalize(k);
          if (!kw) return false;
          return t.matchType === 'contains' ? norm.includes(kw) : norm === kw;
        });
      });
      if (byKeyword) return byKeyword;
    }

    if (isNewConversation) {
      return applicable.find((f) => f.triggers?.onNewConversation) || null;
    }
    return null;
  }

  // ─── Saneado del grafo ────────────────────────────────────────

  private async sanitizeNodes(
    nodes: FlowNode[],
    flow: ConversationFlow,
  ): Promise<FlowNode[]> {
    if (!Array.isArray(nodes))
      throw new BadRequestException('nodes debe ser un arreglo');
    if (nodes.length > MAX_NODES)
      throw new BadRequestException(
        `Un flujo admite máximo ${MAX_NODES} nodos`,
      );

    const seen = new Set<string>();
    const clean: FlowNode[] = [];
    for (const raw of nodes) {
      const id = String(raw?.id || '').trim();
      if (!id || id.length > 64 || id.includes(':') || seen.has(id)) continue;
      if (!NODE_TYPES.has(raw?.type)) continue;
      seen.add(id);

      const d = raw.data || {};
      const node: FlowNode = {
        id,
        type: raw.type,
        position: {
          x: Number.isFinite(raw.position?.x) ? raw.position.x : 0,
          y: Number.isFinite(raw.position?.y) ? raw.position.y : 0,
        },
        data: {},
      };

      switch (raw.type) {
        case 'message': {
          node.data.text = String(d.text || '').slice(0, 4096);
          const buttons = (Array.isArray(d.buttons) ? d.buttons : [])
            .map((b: any) => ({
              id: String(b?.id || '')
                .trim()
                .replace(/:/g, ''),
              title: String(b?.title || '')
                .trim()
                .slice(0, MAX_BUTTON_TITLE),
            }))
            .filter((b) => b.id && b.title);
          if (buttons.length > MAX_FLOW_BUTTONS) {
            throw new BadRequestException(
              `Un mensaje admite máximo ${MAX_FLOW_BUTTONS} botones`,
            );
          }
          if (buttons.length) node.data.buttons = buttons;
          break;
        }
        case 'user_input':
          node.data.text = String(d.text || '').slice(0, 4096);
          node.data.variable = this.cleanVariable(d.variable);
          node.data.validation = VALIDATIONS.has(d.validation as string)
            ? d.validation
            : 'any';
          node.data.errorMessage = d.errorMessage
            ? String(d.errorMessage).slice(0, 1000)
            : undefined;
          break;
        case 'action':
          node.data.actions = (Array.isArray(d.actions) ? d.actions : [])
            .filter((a: any) => a && ACTION_TYPES.has(a.type))
            .map((a: any) => ({
              type: a.type,
              ...(a.type === 'set_variable'
                ? {
                    variable: this.cleanVariable(a.variable),
                    value: String(a.value ?? '').slice(0, 1000),
                  }
                : {}),
              ...(a.type === 'add_label' || a.type === 'remove_label'
                ? { labelId: String(a.labelId || '') }
                : {}),
            }));
          break;
        case 'condition':
          node.data.conditionVariable = this.cleanVariable(d.conditionVariable);
          node.data.conditionOperator = OPERATORS.has(
            d.conditionOperator as string,
          )
            ? d.conditionOperator
            : 'equals';
          node.data.conditionValue = String(d.conditionValue ?? '').slice(
            0,
            500,
          );
          break;
        case 'start_flow': {
          const target = String(d.targetFlowId || '');
          if (target) {
            // El flujo destino debe pertenecer al mismo tenant.
            const exists = await this.loadForTenant(flow.tenantId, target);
            if (exists) node.data.targetFlowId = target;
          }
          break;
        }
      }
      clean.push(node);
    }

    const starts = clean.filter((n) => n.type === 'start');
    if (starts.length !== 1)
      throw new BadRequestException(
        'El flujo debe tener exactamente un nodo de inicio',
      );
    return clean;
  }

  private sanitizeEdges(edges: FlowEdge[], nodes: FlowNode[]): FlowEdge[] {
    if (!Array.isArray(edges))
      throw new BadRequestException('edges debe ser un arreglo');
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const usedHandles = new Set<string>();
    const clean: FlowEdge[] = [];

    for (const raw of edges) {
      const source = byId.get(String(raw?.source || ''));
      const target = byId.get(String(raw?.target || ''));
      if (
        !source ||
        !target ||
        target.type === 'start' ||
        source.id === target.id
      )
        continue;

      const handle = String(raw.sourceHandle || 'next');
      if (!this.isValidHandle(source, handle)) continue;

      // Cada salida conecta con un único destino.
      const key = `${source.id}|${handle}`;
      if (usedHandles.has(key)) continue;
      usedHandles.add(key);

      clean.push({
        id: String(raw.id || key).slice(0, 128),
        source: source.id,
        sourceHandle: handle,
        target: target.id,
      });
    }
    return clean;
  }

  private isValidHandle(node: FlowNode, handle: string): boolean {
    switch (node.type) {
      case 'message':
        if (node.data.buttons?.length) {
          return (
            handle.startsWith('btn:') &&
            node.data.buttons.some((b) => `btn:${b.id}` === handle)
          );
        }
        return handle === 'next';
      case 'condition':
        return handle === 'true' || handle === 'false';
      case 'start_flow':
        return false; // salta a otro flujo: no tiene salida
      default:
        return handle === 'next';
    }
  }

  private sanitizeTriggers(t: FlowTriggers | null): FlowTriggers {
    const keywords = (Array.isArray(t?.keywords) ? t!.keywords : [])
      .map((k) =>
        String(k || '')
          .trim()
          .slice(0, 100),
      )
      .filter(Boolean)
      .slice(0, 50);
    return {
      keywords,
      matchType: t?.matchType === 'contains' ? 'contains' : 'exact',
      onNewConversation: t?.onNewConversation === true,
      inboxIds: (Array.isArray(t?.inboxIds) ? t!.inboxIds : [])
        .map(String)
        .filter(Boolean),
    };
  }

  private cleanVariable(v: unknown): string | undefined {
    const s = String(v || '').trim();
    return VARIABLE_RE.test(s) ? s : undefined;
  }
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
