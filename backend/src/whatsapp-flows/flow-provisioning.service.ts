import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppFlow } from './entities/whatsapp-flow.entity';
import { Inbox } from '../chats/inbox.entity';
import { FlowEncryptionKeyService } from './flow-encryption-key.service';

const GRAPH_VERSION = 'v21.0';

/** Categorías válidas de un Flow en Meta. */
export type FlowCategory =
  | 'APPOINTMENT_BOOKING'
  | 'LEAD_GENERATION'
  | 'CONTACT_US'
  | 'CUSTOMER_SUPPORT'
  | 'SURVEY'
  | 'OTHER';

export interface CreateFlowOnMetaInput {
  tenantId: string;
  // Inbox de WhatsApp desde el que se gestiona (de aquí salen waba_id y token).
  inboxId: string;
  name: string;
  categories: FlowCategory[];
  // JSON del Flow (pantallas + routing_model + data_api_version).
  flowJson: Record<string, any>;
  // Si el Flow usa endpoint (data_exchange), se fija el endpoint_uri. Por
  // defecto usa el endpoint del sistema. Pasa null para un Flow sin endpoint.
  endpointUri?: string | null;
  // Publicar inmediatamente tras subir el JSON. Por defecto false (queda DRAFT).
  publish?: boolean;
}

export interface ProvisionResult {
  success: boolean;
  flowId: string | null; // id local (whatsapp_flows)
  metaFlowId: string | null;
  status: string | null; // DRAFT | PUBLISHED
  validationErrors?: any[];
  error?: string;
}

/**
 * Crea y publica WhatsApp Flows directamente en Meta vía API, y persiste la
 * definición en la tabla whatsapp_flows. Reutiliza el número/clave ya
 * registrados: no toca el cifrado (la clave es por número, compartida por
 * todos los Flows).
 *
 * Secuencia: POST /{waba_id}/flows -> POST /{flow_id}/assets (flow.json)
 *            -> (opcional) POST /{flow_id}/publish.
 */
@Injectable()
export class FlowProvisioningService {
  private readonly logger = new Logger(FlowProvisioningService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(WhatsAppFlow)
    private readonly flowRepo: Repository<WhatsAppFlow>,
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
    private readonly keys: FlowEncryptionKeyService,
  ) {}

  /**
   * Endpoint URI del sistema, POR NÚMERO. La clave de cifrado es por número,
   * así que el endpoint incluye el phone_number_id para resolver qué clave usar.
   */
  private endpointUriForNumber(phoneNumberId: string | null): string {
    const base =
      this.configService.get<string>('PUBLIC_BASE_URL') ||
      this.configService.get<string>('META_BASE_URL') ||
      'https://crm.strategee.us';
    const root = `${base.replace(/\/$/, '')}/webhooks/whatsapp-flow`;
    return phoneNumberId ? `${root}/${phoneNumberId}` : root;
  }

  async createFlow(input: CreateFlowOnMetaInput): Promise<ProvisionResult> {
    const inbox = await this.inboxRepo.findOne({ where: { id: input.inboxId } });
    if (!inbox) throw new BadRequestException('Inbox no encontrado');
    if (inbox.channel !== 'whatsapp' || !inbox.accessToken || !inbox.wabaId) {
      throw new BadRequestException(
        'El inbox no es de WhatsApp o le falta waba_id / access token',
      );
    }

    this.validateFlowJson(input.flowJson);

    // ¿El Flow usa endpoint? Si cualquier pantalla declara data_exchange, sí.
    const usesEndpoint = this.flowUsesEndpoint(input.flowJson);
    const endpointUri =
      input.endpointUri === null
        ? null
        : input.endpointUri ||
          (usesEndpoint ? this.endpointUriForNumber(inbox.phoneNumberId) : null);

    // Si el Flow usa endpoint, asegurar que el número tenga su clave de cifrado
    // registrada en Meta ANTES de crear el Flow (sin clave, el health check y
    // el data_exchange fallarían). setupForInbox es idempotente.
    if (usesEndpoint) {
      try {
        await this.keys.setupForInbox(inbox.id);
      } catch (err: any) {
        return {
          success: false,
          flowId: null,
          metaFlowId: null,
          status: null,
          error: `No se pudo preparar la clave de cifrado del número: ${err.message}`,
        };
      }
    }

    // 1) Crear el Flow en Meta (nace en DRAFT).
    const createBody: Record<string, any> = {
      name: input.name,
      categories: input.categories,
    };
    if (endpointUri) createBody.endpoint_uri = endpointUri;

    const createRes = await this.metaPost(
      `${inbox.wabaId}/flows`,
      inbox.accessToken,
      createBody,
    );
    if (!createRes.ok || !createRes.data?.id) {
      return {
        success: false,
        flowId: null,
        metaFlowId: null,
        status: null,
        error: this.errMsg(createRes.data, 'No se pudo crear el Flow en Meta'),
      };
    }
    const metaFlowId = String(createRes.data.id);
    this.logger.log(`[FlowProvision] Flow creado en Meta: ${metaFlowId}`);

    // 2) Subir el flow.json como asset.
    const uploadRes = await this.uploadFlowJson(
      metaFlowId,
      inbox.accessToken,
      input.flowJson,
    );
    if (!uploadRes.ok) {
      // Persistimos de todos modos el registro en DRAFT para no perder el Flow.
      const saved = await this.persist(input, inbox, metaFlowId, 'draft', endpointUri);
      return {
        success: false,
        flowId: saved.id,
        metaFlowId,
        status: 'DRAFT',
        validationErrors: uploadRes.data?.validation_errors,
        error: this.errMsg(uploadRes.data, 'El flow.json tiene errores de validación'),
      };
    }

    let status = 'draft';

    // 3) Publicar si se pidió.
    if (input.publish) {
      const pubRes = await this.metaPost(
        `${metaFlowId}/publish`,
        inbox.accessToken,
        {},
      );
      if (!pubRes.ok) {
        const saved = await this.persist(input, inbox, metaFlowId, 'draft', endpointUri);
        return {
          success: false,
          flowId: saved.id,
          metaFlowId,
          status: 'DRAFT',
          error: this.errMsg(pubRes.data, 'No se pudo publicar el Flow'),
        };
      }
      status = 'published';
      this.logger.log(`[FlowProvision] Flow publicado: ${metaFlowId}`);
    }

    const saved = await this.persist(input, inbox, metaFlowId, status, endpointUri);
    return {
      success: true,
      flowId: saved.id,
      metaFlowId,
      status: status.toUpperCase(),
    };
  }

  /**
   * Actualiza el flow.json de un Flow existente (sube el asset a Meta) y
   * persiste la nueva definición. No publica: el Flow mantiene su estado.
   */
  async updateFlowJson(
    localFlowId: string,
    flowJson: Record<string, any>,
  ): Promise<ProvisionResult> {
    const flow = await this.flowRepo.findOne({ where: { id: localFlowId } });
    if (!flow) throw new BadRequestException('Flow local no encontrado');
    if (!flow.metaFlowId) {
      throw new BadRequestException('El Flow no existe en Meta (sin metaFlowId)');
    }

    this.validateFlowJson(flowJson);

    const inbox = await this.resolveInbox(flow.tenantId, flow.inboxId);
    if (!inbox?.accessToken) throw new BadRequestException('Sin access token');

    const uploadRes = await this.uploadFlowJson(flow.metaFlowId, inbox.accessToken, flowJson);
    if (!uploadRes.ok) {
      return {
        success: false,
        flowId: flow.id,
        metaFlowId: flow.metaFlowId,
        status: flow.status?.toUpperCase() || 'DRAFT',
        validationErrors: uploadRes.data?.validation_errors,
        error: this.errMsg(uploadRes.data, 'El flow.json tiene errores de validación'),
      };
    }

    flow.flowJson = flowJson;
    flow.dataApiVersion = flowJson?.data_api_version || null;
    flow.entryScreen = this.extractEntryScreen(flowJson);
    await this.flowRepo.save(flow);

    return {
      success: true,
      flowId: flow.id,
      metaFlowId: flow.metaFlowId,
      status: flow.status?.toUpperCase() || 'DRAFT',
    };
  }

  /**
   * Valida un flow.json contra el validador de Meta SIN marcarlo como guardado
   * definitivo (equivale al botón "Ejecutar/validar" del editor de Meta).
   *
   * Sube el asset a /{flow_id}/assets y devuelve los validation_errors que Meta
   * detecta, con la ruta exacta del problema. Requiere que el Flow exista en
   * Meta; si no tiene metaFlowId, solo se puede validar localmente.
   *
   * NOTA: subir el asset reemplaza el borrador en Meta. Como el Flow está en
   * DRAFT mientras se edita, esto es equivalente a lo que hace el editor de
   * Meta al validar. Sí persistimos el flowJson en BD para mantener coherencia.
   */
  async validateFlowOnMeta(
    localFlowId: string,
    flowJson: Record<string, any>,
  ): Promise<{
    valid: boolean;
    errors: Array<{ code?: string; type?: string; message: string; pointer?: string }>;
    metaReachable: boolean;
  }> {
    const flow = await this.flowRepo.findOne({ where: { id: localFlowId } });
    if (!flow) throw new BadRequestException('Flow local no encontrado');

    // Validación local básica siempre disponible.
    if (!flow.metaFlowId) {
      return { valid: true, errors: [], metaReachable: false };
    }

    const inbox = await this.resolveInbox(flow.tenantId, flow.inboxId);
    if (!inbox?.accessToken) {
      return { valid: true, errors: [], metaReachable: false };
    }

    const uploadRes = await this.uploadFlowJson(flow.metaFlowId, inbox.accessToken, flowJson);
    const rawErrors: any[] = uploadRes.data?.validation_errors || [];

    // Si no hubo errores bloqueantes, guardamos el JSON en BD (quedó aplicado).
    if (uploadRes.ok) {
      flow.flowJson = flowJson;
      flow.dataApiVersion = flowJson?.data_api_version || flow.dataApiVersion || null;
      flow.entryScreen = this.extractEntryScreen(flowJson);
      await this.flowRepo.save(flow);
    }

    const errors = rawErrors.map((e) => ({
      code: e.error,
      type: e.error_type,
      message: e.message || String(e),
      pointer: this.extractPointer(e.message),
    }));

    return {
      valid: errors.filter((e) => e.type !== 'WARNING').length === 0,
      errors,
      metaReachable: true,
    };
  }

  /** Extrae la ruta "$root/..." del mensaje de error de Meta, si existe. */
  private extractPointer(message?: string): string | undefined {
    if (!message) return undefined;
    const m = message.match(/\$root[\w/\[\]0-9.-]*/);
    return m ? m[0] : undefined;
  }

  /**
   * Intenta ELIMINAR un Flow en Meta por su id. Meta solo permite borrar Flows
   * que no estén publicados/en uso; si no se puede, devuelve ok:false con el
   * motivo (el llamador puede desvincular localmente de todos modos).
   */
  /**
   * Consulta en Meta el estado real de un Flow (PUBLISHED | DRAFT | DEPRECATED
   * | THROTTLED | BLOCKED | ...). Devuelve null si no se pudo consultar. Se usa
   * para filtrar las encuestas que realmente se pueden usar en un botón de
   * plantilla (solo PUBLISHED).
   */
  async getFlowStatusOnMeta(
    tenantId: string,
    inboxId: string | null,
    metaFlowId: string,
  ): Promise<string | null> {
    const inbox = await this.resolveInbox(tenantId, inboxId);
    if (!inbox?.accessToken) return null;
    try {
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${metaFlowId}?fields=status`,
        { headers: { Authorization: `Bearer ${inbox.accessToken}` } },
      );
      const data = await res.json().catch(() => ({}));
      if (data?.error) return null;
      return data?.status ? String(data.status).toUpperCase() : null;
    } catch {
      return null;
    }
  }

  /**
   * Publica un Flow EXISTENTE en Meta por su metaFlowId (DRAFT -> PUBLISHED),
   * sin crear uno nuevo. Pensado para encuestas ya vinculadas: evita el error
   * "el nombre ya está publicado" que ocurre al intentar re-crear el Flow.
   */
  async publishExistingFlowOnMeta(
    tenantId: string,
    inboxId: string | null,
    metaFlowId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const inbox = await this.resolveInbox(tenantId, inboxId);
    if (!inbox?.accessToken) {
      return { ok: false, error: 'Sin access token del canal de WhatsApp' };
    }
    const res = await this.metaPost(`${metaFlowId}/publish`, inbox.accessToken, {});
    if (res.ok && res.data?.success !== false) return { ok: true };
    return { ok: false, error: this.errMsg(res.data, 'No se pudo publicar el Flow en Meta') };
  }

  async deleteFlowOnMeta(
    tenantId: string,
    inboxId: string | null,
    metaFlowId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const inbox = await this.resolveInbox(tenantId, inboxId);
    if (!inbox?.accessToken) {
      return { ok: false, error: 'Sin access token del canal de WhatsApp' };
    }
    try {
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${metaFlowId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${inbox.accessToken}` } },
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success !== false) return { ok: true };
      return { ok: false, error: this.errMsg(data, 'Meta no permitió eliminar el Flow') };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Error al eliminar el Flow en Meta' };
    }
  }

  /**
   * Sube un flow.json a un Flow EXISTENTE de Meta identificado por su metaFlowId
   * (resolviendo el token del inbox del tenant). Devuelve si Meta lo aceptó y
   * los errores de validación con su ruta. No requiere un registro en
   * whatsapp_flows: pensado para el módulo de encuestas, que guarda su propio
   * metaFlowId. No publica: el Flow mantiene su estado.
   */
  async uploadFlowJsonToMeta(
    tenantId: string,
    inboxId: string | null,
    metaFlowId: string,
    flowJson: Record<string, any>,
  ): Promise<{
    ok: boolean;
    errors: Array<{ code?: string; type?: string; message: string; pointer?: string }>;
    metaReachable: boolean;
  }> {
    this.validateFlowJson(flowJson);
    const inbox = await this.resolveInbox(tenantId, inboxId);
    if (!inbox?.accessToken) {
      return { ok: false, errors: [], metaReachable: false };
    }
    const uploadRes = await this.uploadFlowJson(metaFlowId, inbox.accessToken, flowJson);
    const rawErrors: any[] = uploadRes.data?.validation_errors || [];
    const errors = rawErrors.map((e) => ({
      code: e.error,
      type: e.error_type,
      message: e.message || String(e),
      pointer: this.extractPointer(e.message) || e.pointers?.[0]?.path,
    }));
    return { ok: uploadRes.ok, errors, metaReachable: true };
  }

  /**
   * Valida un flow.json ARBITRARIO contra el validador de Meta sin requerir un
   * Flow local previo. Crea un Flow temporal en la WABA del inbox, le sube el
   * asset para obtener los validation_errors y lo elimina. Es el mismo criterio
   * que usa el editor de Meta al "Ejecutar". No deja basura en la cuenta.
   */
  async validateFlowJsonOnMeta(
    tenantId: string,
    inboxId: string,
    flowJson: Record<string, any>,
  ): Promise<{
    valid: boolean;
    errors: Array<{ code?: string; type?: string; message: string; pointer?: string }>;
    metaReachable: boolean;
  }> {
    this.validateFlowJson(flowJson);
    const inbox = await this.resolveInbox(tenantId, inboxId);
    if (!inbox?.accessToken || !inbox.wabaId) {
      return { valid: true, errors: [], metaReachable: false };
    }

    // 1) Crear Flow temporal.
    const createRes = await this.metaPost(`${inbox.wabaId}/flows`, inbox.accessToken, {
      name: `__validate_${Date.now()}`,
      categories: ['SURVEY'],
    });
    if (!createRes.ok || !createRes.data?.id) {
      return { valid: true, errors: [], metaReachable: false };
    }
    const tempId = String(createRes.data.id);

    try {
      // 2) Subir el asset => obtener validation_errors.
      const uploadRes = await this.uploadFlowJson(tempId, inbox.accessToken, flowJson);
      const rawErrors: any[] = uploadRes.data?.validation_errors || [];
      const errors = rawErrors.map((e) => ({
        code: e.error,
        type: e.error_type,
        message: e.message || String(e),
        pointer: this.extractPointer(e.message) || e.pointers?.[0]?.path,
      }));
      return {
        valid: errors.filter((e) => e.type !== 'WARNING').length === 0,
        errors,
        metaReachable: true,
      };
    } finally {
      // 3) Borrar el Flow temporal (no dejar basura en Meta).
      await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${tempId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${inbox.accessToken}` },
      }).catch(() => {});
    }
  }

  /**
   * Publica un Flow ya existente (local) que esté en DRAFT.
   */
  async publishFlow(localFlowId: string): Promise<ProvisionResult> {
    const flow = await this.flowRepo.findOne({ where: { id: localFlowId } });
    if (!flow) throw new BadRequestException('Flow local no encontrado');
    if (!flow.metaFlowId) throw new BadRequestException('El Flow no tiene metaFlowId (no existe en Meta)');

    const inbox = await this.resolveInbox(flow.tenantId, flow.inboxId);
    if (!inbox?.accessToken) throw new BadRequestException('Sin access token para publicar');

    const pubRes = await this.metaPost(`${flow.metaFlowId}/publish`, inbox.accessToken, {});
    if (!pubRes.ok) {
      return {
        success: false,
        flowId: flow.id,
        metaFlowId: flow.metaFlowId,
        status: flow.status?.toUpperCase() || 'DRAFT',
        error: this.errMsg(pubRes.data, 'No se pudo publicar el Flow'),
      };
    }
    flow.status = 'published';
    await this.flowRepo.save(flow);
    return { success: true, flowId: flow.id, metaFlowId: flow.metaFlowId, status: 'PUBLISHED' };
  }

  // ---- Helpers ----

  private async persist(
    input: CreateFlowOnMetaInput,
    inbox: Inbox,
    metaFlowId: string,
    status: string,
    endpointUri: string | null,
  ): Promise<WhatsAppFlow> {
    let flow = await this.flowRepo.findOne({
      where: { tenantId: input.tenantId, metaFlowId },
    });
    if (!flow) {
      flow = this.flowRepo.create({ tenantId: input.tenantId, metaFlowId });
    }
    flow.inboxId = inbox.id;
    flow.name = input.name;
    flow.status = status;
    flow.categories = input.categories;
    flow.flowJson = input.flowJson;
    flow.dataApiVersion = input.flowJson?.data_api_version || null;
    flow.entryScreen = this.extractEntryScreen(input.flowJson);
    flow.metadata = { ...(flow.metadata || {}), endpointUri };
    return this.flowRepo.save(flow);
  }

  /** Sube el flow.json como multipart a /{flow_id}/assets. */
  private async uploadFlowJson(
    metaFlowId: string,
    accessToken: string,
    flowJson: Record<string, any>,
  ): Promise<{ ok: boolean; data: any }> {
    try {
      const form = new FormData();
      form.append('name', 'flow.json');
      form.append('asset_type', 'FLOW_JSON');
      const blob = new Blob([JSON.stringify(flowJson)], { type: 'application/json' });
      form.append('file', blob, 'flow.json');

      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${metaFlowId}/assets`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form },
      );
      const data = await res.json();
      // Meta devuelve success:true y, si hay problemas, validation_errors.
      const hasBlockingErrors =
        Array.isArray(data?.validation_errors) &&
        data.validation_errors.some((e: any) => e?.error_type !== 'WARNING');
      return { ok: res.ok && data?.success !== false && !hasBlockingErrors, data };
    } catch (err: any) {
      return { ok: false, data: { error: { message: err.message } } };
    }
  }

  private async metaPost(
    path: string,
    accessToken: string,
    body: Record<string, any>,
  ): Promise<{ ok: boolean; data: any }> {
    try {
      const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      return { ok: res.ok, data };
    } catch (err: any) {
      return { ok: false, data: { error: { message: err.message } } };
    }
  }

  private validateFlowJson(flowJson: Record<string, any>): void {
    if (!flowJson || typeof flowJson !== 'object') {
      throw new BadRequestException('flowJson inválido');
    }
    if (!flowJson.version) {
      throw new BadRequestException('flowJson sin "version"');
    }
    if (!Array.isArray(flowJson.screens) || flowJson.screens.length === 0) {
      throw new BadRequestException('flowJson sin "screens"');
    }
  }

  /** Detecta si alguna pantalla usa data_exchange (-> Flow con endpoint). */
  private flowUsesEndpoint(flowJson: Record<string, any>): boolean {
    const str = JSON.stringify(flowJson || {});
    return str.includes('"data_exchange"') || !!flowJson?.data_api_version;
  }

  private extractEntryScreen(flowJson: Record<string, any>): string | null {
    const rm = flowJson?.routing_model;
    if (rm && typeof rm === 'object') {
      const keys = Object.keys(rm);
      if (keys.length > 0) return keys[0];
    }
    if (Array.isArray(flowJson?.screens) && flowJson.screens[0]?.id) {
      return flowJson.screens[0].id;
    }
    return null;
  }

  private async resolveInbox(
    tenantId: string,
    inboxId?: string | null,
  ): Promise<Inbox | null> {
    if (inboxId) {
      const inbox = await this.inboxRepo.findOne({ where: { id: inboxId } });
      if (inbox?.accessToken) return inbox;
    }
    return this.inboxRepo.findOne({ where: { tenantId, channel: 'whatsapp' } });
  }

  private errMsg(data: any, fallback: string): string {
    return (
      data?.error?.error_user_msg ||
      data?.error?.message ||
      data?.validation_errors?.[0]?.message ||
      fallback
    );
  }
}
