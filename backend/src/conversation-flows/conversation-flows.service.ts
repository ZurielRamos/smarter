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
  FlowButton,
  FlowButtonType,
  FlowHeaderType,
  FlowTriggers,
} from './conversation-flow.entity';
import { MediaStorageService } from '../media/media-storage.service';
import { CustomField } from '../records/custom-field.entity';
import {
  CONTACT_SYSTEM_FIELDS,
  FLOW_SPECIAL_VARIABLES,
  VARIABLE_KEY_RE,
} from './contact-fields.util';
import { isValidButtonUrl, normalizePhone } from './flow-buttons.util';
import {
  compressVideoForWhatsApp,
  WA_VIDEO_LIMIT,
} from '../media/whatsapp-transcode.util';
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
const HEADER_MEDIA_TYPES = new Set(['image', 'video', 'document']);
/** Documentos que WhatsApp acepta. */
const DOCUMENT_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);
const VARIABLE_RE = /^[a-zA-Z_][\w]{0,49}$/;

/** Máximo de botones por mensaje (límite de las listas de WhatsApp). */
export const MAX_FLOW_BUTTONS = 10;
/** Botones de enlace o llamada por mensaje (Messenger admite 3 en su plantilla). */
const MAX_ACTION_BUTTONS = 3;
const MAX_BUTTON_TITLE = 24;
/** Título de botones de enlace/llamada: 20 en WhatsApp (cta_url) y Messenger. */
const MAX_ACTION_TITLE = 20;
const MAX_NODES = 300;

@Injectable()
export class ConversationFlowsService {
  constructor(
    @InjectRepository(ConversationFlow)
    private readonly flowRepo: Repository<ConversationFlow>,
    private readonly mediaStorage: MediaStorageService,
    @InjectRepository(CustomField)
    private readonly customFieldRepo: Repository<CustomField>,
  ) {}

  /**
   * Variables que el editor ofrece al escribir `{{`: las propias del flujo, los
   * campos del sistema del CRM y TODOS los campos personalizados del tenant.
   * Es la misma lista que el motor sabe resolver al enviar.
   */
  async getVariableCatalog(tenantId: string): Promise<{
    special: { key: string; label: string; description: string }[];
    crm: { key: string; label: string; group: string }[];
    custom: { key: string; label: string; fieldType: string }[];
  }> {
    if (!tenantId) throw new BadRequestException('tenantId es requerido');
    const customFields = await this.customFieldRepo.find({
      where: { tenantId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    const systemKeys = new Set(CONTACT_SYSTEM_FIELDS.map((f) => f.key));
    const seen = new Set<string>();
    const custom = customFields
      // Los del sistema ya vienen de la lista fija; una clave que el motor no
      // pueda reconocer ({{clave}} solo admite letras, números y _) no serviría.
      .filter((f) => !f.isSystem && !systemKeys.has(f.fieldKey))
      .filter((f) => VARIABLE_KEY_RE.test(f.fieldKey))
      .filter((f) => (seen.has(f.fieldKey) ? false : !!seen.add(f.fieldKey)))
      .map((f) => ({
        key: f.fieldKey,
        label: f.fieldLabel,
        fieldType: f.fieldType,
      }));

    return {
      special: FLOW_SPECIAL_VARIABLES,
      crm: CONTACT_SYSTEM_FIELDS,
      custom,
    };
  }

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

  /**
   * Sube el archivo del encabezado multimedia de un nodo Mensaje, ya en un
   * formato que WhatsApp acepta por link:
   *   - imagen → JPEG (WhatsApp no acepta WebP, que es lo que genera uploadBuffer)
   *   - video  → MP4 H.264/AAC < 16 MB (perfil compatible con Android)
   *   - documento → tal cual (PDF, Office, texto)
   */
  async uploadHeaderMedia(
    tenantId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{
    url: string;
    type: 'image' | 'video' | 'document';
    filename: string;
    mimeType: string;
  }> {
    if (!tenantId) throw new BadRequestException('tenantId es requerido');
    if (!file?.buffer?.length)
      throw new BadRequestException('Archivo requerido');

    const mime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
    const filename = (file.originalname || 'archivo').slice(0, 240);
    const base = {
      channel: 'flows',
      tenantId,
      conversationId: 'header-media',
      messageId: `hdr-${Date.now()}`,
    };

    if (mime.startsWith('image/') && !mime.includes('svg')) {
      const stored = await this.mediaStorage.uploadImageAsJpeg(
        file.buffer,
        base,
      );
      if (!stored?.url)
        throw new BadRequestException('No se pudo guardar la imagen');
      return {
        url: stored.url,
        type: 'image',
        filename,
        mimeType: 'image/jpeg',
      };
    }

    if (mime.startsWith('video/')) {
      let video: Buffer;
      try {
        video = await compressVideoForWhatsApp(file.buffer, WA_VIDEO_LIMIT);
      } catch (err: any) {
        throw new BadRequestException(
          `No se pudo procesar el video: ${err?.message || err}`,
        );
      }
      if (video.length > WA_VIDEO_LIMIT) {
        throw new BadRequestException(
          'El video no cabe en 16 MB ni comprimido. Usa un video más corto.',
        );
      }
      const stored = await this.mediaStorage.uploadBuffer(video, {
        ...base,
        mimeType: 'video/mp4',
        filename: filename.replace(/\.[^.]+$/, '') + '.mp4',
      });
      if (!stored?.url)
        throw new BadRequestException('No se pudo guardar el video');
      return {
        url: stored.url,
        type: 'video',
        filename,
        mimeType: 'video/mp4',
      };
    }

    if (DOCUMENT_MIMES.has(mime)) {
      const stored = await this.mediaStorage.uploadBuffer(file.buffer, {
        ...base,
        mimeType: mime,
        filename,
      });
      if (!stored?.url)
        throw new BadRequestException('No se pudo guardar el documento');
      return { url: stored.url, type: 'document', filename, mimeType: mime };
    }

    throw new BadRequestException(
      'Formato no soportado. Usa una imagen, un video o un documento PDF/Office/texto.',
    );
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
          // Límite de WhatsApp para header/footer de mensajes interactivos.
          const footer = String(d.footer || '')
            .trim()
            .slice(0, 60);
          if (footer) node.data.footer = footer;
          const headerType = HEADER_MEDIA_TYPES.has(String(d.headerType))
            ? (d.headerType as FlowHeaderType)
            : 'text';
          if (headerType === 'text') {
            const header = String(d.header || '')
              .trim()
              .slice(0, 60);
            if (header) node.data.header = header;
          } else {
            // Solo URLs https (las sube el endpoint upload-media a nuestro storage).
            const url = String(d.headerMediaUrl || '').trim();
            if (/^https:\/\/\S+$/i.test(url) && url.length <= 2048) {
              node.data.headerType = headerType;
              node.data.headerMediaUrl = url;
              const name = String(d.headerMediaName || '')
                .trim()
                .slice(0, 240);
              if (name) node.data.headerMediaName = name;
            }
          }
          const buttons = this.sanitizeButtons(d.buttons);
          if (buttons.length) node.data.buttons = buttons;
          // Solo tiene sentido si hay archivo en el encabezado y más de 3 respuestas.
          if (d.overflow === 'list') node.data.overflow = 'list';
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

  /**
   * Valida y normaliza los botones de un nodo Mensaje.
   *  - reply: título ≤ 24, hasta 10, cada uno con su salida en el grafo.
   *  - url / call: título ≤ 20 (límite de WhatsApp y Messenger), hasta 3 en total.
   * Una URL o teléfono mal formado se rechaza con un mensaje claro; uno vacío se
   * conserva (el usuario aún lo está editando) y se omite al enviar.
   */
  private sanitizeButtons(raw: unknown): FlowButton[] {
    const out: FlowButton[] = [];
    const seen = new Set<string>();
    for (const item of Array.isArray(raw) ? raw : []) {
      const b = item as Record<string, unknown>;
      const id = String(b?.id || '')
        .trim()
        .replace(/:/g, '');
      const type: FlowButtonType =
        b?.type === 'url' || b?.type === 'call' ? b.type : 'reply';
      const title = String(b?.title || '')
        .trim()
        .slice(0, type === 'reply' ? MAX_BUTTON_TITLE : MAX_ACTION_TITLE);
      if (!id || !title || seen.has(id)) continue;
      seen.add(id);

      if (type === 'reply') {
        out.push({ id, title });
      } else if (type === 'url') {
        const url = String(b.url || '').trim();
        if (url && !isValidButtonUrl(url)) {
          throw new BadRequestException(
            `El botón «${title}» tiene un enlace no válido. Debe empezar por http:// o https://`,
          );
        }
        out.push({
          id,
          title,
          type,
          ...(url ? { url } : {}),
          // Activo por defecto: solo se guarda cuando se desactiva.
          ...(b.track === false ? { track: false } : {}),
        });
      } else {
        const raw = String(b.phone || '').trim();
        const phone = normalizePhone(raw);
        if (raw && !phone) {
          throw new BadRequestException(
            `El botón «${title}» tiene un teléfono no válido. Debe empezar por + y el código de país, p. ej. +573001234567`,
          );
        }
        out.push({ id, title, type, ...(phone ? { phone } : {}) });
      }
    }

    const replies = out.filter((b) => (b.type ?? 'reply') === 'reply').length;
    if (replies > MAX_FLOW_BUTTONS) {
      throw new BadRequestException(
        `Un mensaje admite máximo ${MAX_FLOW_BUTTONS} botones de respuesta`,
      );
    }
    if (out.length - replies > MAX_ACTION_BUTTONS) {
      throw new BadRequestException(
        `Un mensaje admite máximo ${MAX_ACTION_BUTTONS} botones de enlace o llamada`,
      );
    }
    return out;
  }

  private isValidHandle(node: FlowNode, handle: string): boolean {
    switch (node.type) {
      case 'message': {
        // Las respuestas tienen su salida `btn:`; los enlaces rastreados tienen
        // «Al hacer clic» (`click:`); las llamadas no ramifican.
        const buttons = node.data.buttons || [];
        if (handle.startsWith('click:')) {
          return buttons.some(
            (b) =>
              b.type === 'url' &&
              b.track !== false &&
              `click:${b.id}` === handle,
          );
        }
        const replies = buttons.filter((b) => (b.type ?? 'reply') === 'reply');
        if (replies.length) {
          return (
            handle.startsWith('btn:') &&
            replies.some((b) => `btn:${b.id}` === handle)
          );
        }
        return handle === 'next';
      }
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
