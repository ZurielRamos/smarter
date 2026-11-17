import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Global,
  Injectable,
  Module,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { IS_PUBLIC_KEY } from './public.decorator';
import { TenantRole } from '../users/enums/tenant-role.enum';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Recursos con columna `tenant_id` propia: tabla donde se busca el dueño. */
const DIRECT_TABLES = {
  bot: 'bots',
  template: 'templates',
  emailTemplate: 'email_templates',
  mappingTemplate: 'mapping_templates',
  record: 'clients',
  recordNote: 'notes',
  recordActivity: 'activities',
  recordList: 'record_lists',
  customField: 'custom_fields',
  campaign: 'campaigns',
  inbox: 'inboxes',
  label: 'labels',
  team: 'teams',
  form: 'forms',
  waFlow: 'whatsapp_flows',
  waFlowSubmission: 'whatsapp_flow_submissions',
  adPlatform: 'ad_platforms',
  conversionEvent: 'conversion_events',
  contactEvent: 'contact_events',
  wooHook: 'woo_hooks',
  userWebhook: 'webhooks',
  channelConfig: 'channel_configs',
  importJob: 'import_jobs',
  course: 'courses',
  lesson: 'course_lessons',
  quiz: 'course_quizzes',
  question: 'course_questions',
  enrollment: 'course_enrollments',
  certificate: 'course_certificates',
  conversationFlow: 'conversation_flows',
} as const;

/** Recursos cuyo tenant se deduce a través de otra fila. Devuelven (id, tenant_id). */
const INDIRECT_SQL = {
  botKnowledge: 'SELECT k.id, b.tenant_id FROM bot_knowledge k JOIN bots b ON b.id = k.bot_id WHERE k.id = ANY($1::uuid[])',
  botTool: 'SELECT t.id, b.tenant_id FROM bot_tools t JOIN bots b ON b.id = t.bot_id WHERE t.id = ANY($1::uuid[])',
  campaignSend: 'SELECT s.id, c.tenant_id FROM campaign_sends s JOIN campaigns c ON c.id = s.campaign_id WHERE s.id = ANY($1::uuid[])',
  collaborator: 'SELECT c.id, i.tenant_id FROM inbox_collaborators c JOIN inboxes i ON i.id = c.inbox_id WHERE c.id = ANY($1::uuid[])',
  conversation: 'SELECT c.id, i.tenant_id FROM conversations c JOIN inboxes i ON i.id = c.inbox_id WHERE c.id = ANY($1::uuid[])',
  message: 'SELECT m.id, i.tenant_id FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN inboxes i ON i.id = c.inbox_id WHERE m.id = ANY($1::uuid[])',
  emailDomain: 'SELECT d.id, d.tenant_id FROM email_domain_configs d WHERE d.id = ANY($1::uuid[])',
  teamMember: 'SELECT m.id, t.tenant_id FROM team_members m JOIN teams t ON t.id = m.team_id WHERE m.id = ANY($1::uuid[])',
  importError: 'SELECT e.id, j.tenant_id FROM import_errors e JOIN import_jobs j ON j.id = e.job_id WHERE e.id = ANY($1::uuid[])',
} as const;

export type TenantResourceKind = keyof typeof DIRECT_TABLES | keyof typeof INDIRECT_SQL;

function ownersSql(kind: TenantResourceKind): string {
  if (kind in INDIRECT_SQL) return INDIRECT_SQL[kind as keyof typeof INDIRECT_SQL];
  return `SELECT id, tenant_id FROM ${DIRECT_TABLES[kind as keyof typeof DIRECT_TABLES]} WHERE id = ANY($1::uuid[])`;
}

type AuthUser = { isSuperAdmin?: boolean; tenantRoles?: Array<{ tenantId: string; role?: string; tenant?: unknown }> } | undefined;

/**
 * Averigua a qué cuenta pertenece un recurso. Sirve al guard y a los handlers
 * que no pueden usarlo (subidas multipart: el cuerpo aún no está leído cuando
 * corren los guards).
 */
@Injectable()
export class TenantResourceService {
  constructor(private readonly dataSource: DataSource) {}

  /** Mapa id → tenant_id de los recursos que existen y tienen dueño. */
  async owners(kind: TenantResourceKind, ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows: Array<{ id: string; tenant_id: string | null }> = await this.dataSource.query(ownersSql(kind), [ids]);
    const map = new Map<string, string>();
    for (const r of rows) if (r.tenant_id) map.set(r.id, r.tenant_id);
    return map;
  }

  /** El usuario debe pertenecer a la cuenta indicada (para rutas multipart, donde el guard no ve el cuerpo). */
  assertMember(user: AuthUser, tenantId: unknown, opts: { write?: boolean } = {}): string {
    if (typeof tenantId !== 'string' || !UUID_RE.test(tenantId)) throw new BadRequestException('tenantId requerido');
    if (user?.isSuperAdmin) return tenantId;
    const membership = user?.tenantRoles?.find((tr) => tr.tenantId === tenantId);
    if (!membership || !membership.tenant) throw new ForbiddenException('No tienes acceso a esta cuenta');
    if (opts.write && membership.role === TenantRole.VIEWER) throw new ForbiddenException('Tu rol es de solo lectura en esta cuenta');
    return tenantId;
  }

  /**
   * El usuario debe pertenecer a la cuenta dueña del recurso. Si el recurso no
   * existe o es de otra cuenta, 404 (no se confirma que el id exista).
   * `write`: un `viewer` no puede modificar.
   */
  async assertAccess(user: AuthUser, kind: TenantResourceKind, id: unknown, opts: { write?: boolean } = {}): Promise<string> {
    if (typeof id !== 'string' || !UUID_RE.test(id)) throw new BadRequestException('Identificador inválido');
    const tenantId = (await this.owners(kind, [id])).get(id);
    if (!tenantId) throw new NotFoundException('Recurso no encontrado');
    if (user?.isSuperAdmin) return tenantId;
    const membership = user?.tenantRoles?.find((tr) => tr.tenantId === tenantId);
    if (!membership || !membership.tenant) throw new NotFoundException('Recurso no encontrado');
    if (opts.write && membership.role === TenantRole.VIEWER) throw new ForbiddenException('Tu rol es de solo lectura en esta cuenta');
    return tenantId;
  }
}

@Global()
@Module({ providers: [TenantResourceService], exports: [TenantResourceService] })
export class TenantResourceModule {}

export const TENANT_RESOURCE_KEY = 'tenantResource';
export const TENANT_REFS_KEY = 'tenantRefs';
export const READ_ACTION_KEY = 'tenantReadAction';

/** Marca una ruta que opera sobre un recurso: `param` es el parámetro de ruta con su id. */
export const TenantResource = (kind: TenantResourceKind, param = 'id') =>
  SetMetadata(TENANT_RESOURCE_KEY, { kind, param });

/** Ruta que solo exige estar autenticado (no toca datos de ninguna cuenta). */
export const AuthOnly = () => SetMetadata(TENANT_RESOURCE_KEY, { kind: 'none' });

/** POST/PUT que solo consulta (exportar, vistas previas): un `viewer` puede usarla. */
export const ReadAction = () => SetMetadata(READ_ACTION_KEY, true);

/**
 * Referencia a un recurso que llega en el cuerpo, la query o la ruta (`ids`,
 * `recordId`, `inboxId`...). Cada id debe pertenecer a la misma cuenta que se
 * autoriza. `many`: el campo es una lista; `csv`: llega como texto separado por
 * comas. Si la ruta no declara `tenantId`, la cuenta se deduce de estos recursos.
 */
export interface TenantRef {
  kind: TenantResourceKind;
  in: 'body' | 'query' | 'params';
  field: string;
  many?: boolean;
  csv?: boolean;
}
export const TenantRefs = (...refs: TenantRef[]) => SetMetadata(TENANT_REFS_KEY, refs);

/**
 * Control de acceso por tenant para rutas que no llevan `tenantId` en la ruta.
 * Va DESPUÉS de JwtAuthGuard.
 *
 * - `@TenantResource(...)`: el tenant se toma de la fila del recurso y el
 *   usuario debe pertenecer a él. Si no, el recurso "no existe" (404), para no
 *   confirmar que un UUID existe en otra cuenta.
 * - `@AuthOnly()`: basta estar autenticado.
 * - Resto (listar, crear, acciones masivas): hace falta `tenantId` (query, body
 *   o ruta) o, si no viene, que `@TenantRefs` permita deducirlo. Si llegan
 *   varios (tenantId y recursos), deben ser de la misma cuenta. TenantAccessGuard
 *   deja pasar las peticiones sin tenantId, y los servicios entonces operaban
 *   sobre TODAS las cuentas.
 * - El rol `viewer` es de solo lectura.
 *
 * SuperAdmin pasa los controles de membresía y de rol. Las rutas @Public quedan
 * fuera (tienen sus propias validaciones).
 */
@Injectable()
export class TenantResourceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly resources: TenantResourceService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('No autenticado');

    const meta = this.reflector.getAllAndOverride<{ kind: TenantResourceKind | 'none'; param?: string } | undefined>(TENANT_RESOURCE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (meta?.kind === 'none') return true;

    let tenantId: string;
    const byResource = !!meta;
    if (byResource) {
      const id = request.params?.[meta!.param ?? 'id'];
      if (typeof id !== 'string' || !UUID_RE.test(id)) throw new BadRequestException('Identificador inválido');
      const owner = (await this.resources.owners(meta!.kind as TenantResourceKind, [id])).get(id);
      if (!owner) throw new NotFoundException('Recurso no encontrado');
      tenantId = owner;
      // Si la petición también declara un tenantId, debe ser el del recurso.
      for (const declared of [request.params?.tenantId, request.query?.tenantId, request.body?.tenantId]) {
        if (declared !== undefined && declared !== null && declared !== '' && declared !== owner) {
          throw new BadRequestException('tenantId inconsistente en la solicitud');
        }
      }
      // Los recursos que además llegan en el cuerpo (p. ej. contactos a agregar a una lista) deben ser de la misma cuenta.
      const refTenants = await this.referencedTenants(request, context);
      if (refTenants.size > 1 || (refTenants.size === 1 && !refTenants.has(owner))) throw new NotFoundException('Recurso no encontrado');
    } else {
      tenantId = await this.collectionTenant(request, context);
    }

    if (user.isSuperAdmin) return true;
    const membership = user.tenantRoles?.find((tr: any) => tr.tenantId === tenantId);
    if (!membership || !membership.tenant) {
      if (byResource) throw new NotFoundException('Recurso no encontrado');
      throw new ForbiddenException('No tienes acceso a esta cuenta');
    }
    const readOnlyAction = this.reflector.getAllAndOverride<boolean>(READ_ACTION_KEY, [context.getHandler(), context.getClass()]);
    if (membership.role === TenantRole.VIEWER && !READ_METHODS.has(request.method) && !readOnlyAction) {
      throw new ForbiddenException('Tu rol es de solo lectura en esta cuenta');
    }
    return true;
  }

  /** Cuentas dueñas de los recursos referenciados en la petición (`@TenantRefs`). Todos deben existir. */
  private async referencedTenants(request: any, context: ExecutionContext): Promise<Set<string>> {
    const refs = this.reflector.getAllAndOverride<TenantRef[] | undefined>(TENANT_REFS_KEY, [context.getHandler(), context.getClass()]) ?? [];
    const refTenants = new Set<string>();
    for (const ref of refs) {
      const raw = request[ref.in]?.[ref.field];
      if (raw === undefined || raw === null || raw === '') continue;
      const list = ref.csv && typeof raw === 'string' ? raw.split(',').filter(Boolean) : ref.many ? raw : [raw];
      if (!Array.isArray(list) || list.length > 10_000) throw new BadRequestException(`${ref.field} inválido`);
      const ids = [...new Set(list.map(String))];
      if (ids.some((id) => !UUID_RE.test(id))) throw new BadRequestException(`${ref.field} contiene identificadores inválidos`);
      const owners = await this.resources.owners(ref.kind, ids);
      // Un id inexistente o de otra cuenta se trata igual: no se confirma nada.
      if (ids.some((id) => !owners.has(id))) throw new NotFoundException('Recurso no encontrado');
      for (const t of owners.values()) refTenants.add(t);
    }
    return refTenants;
  }

  private async collectionTenant(request: any, context: ExecutionContext): Promise<string> {
    const candidates = [request.params?.tenantId, request.query?.tenantId, request.body?.tenantId].filter(
      (v) => v !== undefined && v !== null && v !== '',
    );
    for (const c of candidates) {
      if (typeof c !== 'string' || !UUID_RE.test(c)) throw new BadRequestException('tenantId inválido');
    }
    if (new Set(candidates).size > 1) throw new BadRequestException('tenantId inconsistente en la solicitud');
    let tenantId: string | undefined = candidates[0] as string | undefined;

    const refTenants = await this.referencedTenants(request, context);
    if (refTenants.size > 1) throw new NotFoundException('Recurso no encontrado');
    const [refTenant] = [...refTenants];
    if (refTenant) {
      if (tenantId && tenantId !== refTenant) throw new NotFoundException('Recurso no encontrado');
      tenantId = refTenant;
    }
    if (!tenantId) throw new BadRequestException('tenantId requerido');
    return tenantId;
  }
}
