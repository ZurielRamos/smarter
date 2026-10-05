import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppFlow } from './entities/whatsapp-flow.entity';
import { Inbox } from '../chats/inbox.entity';

const GRAPH_VERSION = 'v21.0';

/**
 * Sincroniza la definición (routing_model + screens) de un WhatsApp Flow desde
 * la API de Meta hacia la tabla whatsapp_flows, para que el endpoint pueda
 * enrutar dinámicamente CUALQUIER Flow sin configuración manual.
 *
 * Flujo: GET /{flow_id}/assets -> devuelve una URL de descarga del flow.json
 * -> se descarga y se guarda en WhatsAppFlow.flowJson.
 */
@Injectable()
export class FlowSyncService {
  private readonly logger = new Logger(FlowSyncService.name);

  constructor(
    @InjectRepository(WhatsAppFlow)
    private readonly flowRepo: Repository<WhatsAppFlow>,
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
  ) {}

  /**
   * Devuelve la definición del Flow para un (tenant, metaFlowId), descargándola
   * de Meta y cacheándola si aún no está en BD o si se fuerza el refresco.
   */
  async ensureFlowDefinition(
    tenantId: string,
    metaFlowId: string,
    inboxId?: string | null,
    forceRefresh = false,
  ): Promise<WhatsAppFlow | null> {
    let flow = await this.flowRepo.findOne({ where: { tenantId, metaFlowId } });

    // Si ya tenemos el JSON cacheado y no se fuerza refresco, lo devolvemos.
    if (flow?.flowJson && !forceRefresh) return flow;

    // Resolver un inbox con access token para llamar a Meta.
    const inbox = await this.resolveInbox(tenantId, inboxId, flow?.inboxId);
    if (!inbox?.accessToken) {
      this.logger.warn(
        `[FlowSync] Sin access token para descargar el Flow ${metaFlowId} (tenant ${tenantId})`,
      );
      return flow ?? null;
    }

    const flowJson = await this.downloadFlowJson(metaFlowId, inbox.accessToken);
    if (!flowJson) return flow ?? null;

    const meta = await this.fetchFlowMetadata(metaFlowId, inbox.accessToken);

    if (!flow) {
      flow = this.flowRepo.create({
        tenantId,
        metaFlowId,
        inboxId: inbox.id,
        name: meta?.name || `flow_${metaFlowId}`,
        status: (meta?.status || 'published').toLowerCase(),
        categories: meta?.categories ?? null,
      });
    }

    flow.flowJson = flowJson;
    flow.dataApiVersion = flowJson?.data_api_version || flow.dataApiVersion || null;
    flow.entryScreen = this.extractEntryScreen(flowJson) || flow.entryScreen || null;
    if (meta?.name) flow.name = meta.name;
    if (meta?.status) flow.status = String(meta.status).toLowerCase();

    const saved = await this.flowRepo.save(flow);
    this.logger.log(`[FlowSync] Definición del Flow ${metaFlowId} sincronizada`);
    return saved;
  }

  /**
   * Importa TODOS los Flows ya existentes en la WABA de un inbox (los que se
   * crearon directamente en el panel de Meta) y los sincroniza a la BD.
   *
   * Devuelve el resumen de importación. Para cada Flow intenta descargar su
   * flow.json; si falla (p. ej. Flow en DRAFT sin assets), igual guarda la
   * metadata para que aparezca en la lista.
   */
  async importFlowsFromInbox(
    tenantId: string,
    inboxId: string,
  ): Promise<{ imported: number; total: number; flows: WhatsAppFlow[]; error?: string }> {
    const inbox = await this.inboxRepo.findOne({ where: { id: inboxId } });
    if (!inbox) return { imported: 0, total: 0, flows: [], error: 'Inbox no encontrado' };
    if (inbox.channel !== 'whatsapp' || !inbox.accessToken || !inbox.wabaId) {
      return {
        imported: 0,
        total: 0,
        flows: [],
        error: 'El inbox no es de WhatsApp o le falta waba_id / token',
      };
    }

    // Listar Flows de la WABA.
    let listData: any;
    try {
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${inbox.wabaId}/flows?fields=id,name,status,categories`,
        { headers: { Authorization: `Bearer ${inbox.accessToken}` } },
      );
      listData = await res.json();
      if (!res.ok) {
        return {
          imported: 0,
          total: 0,
          flows: [],
          error: listData?.error?.message || 'No se pudieron listar los Flows de Meta',
        };
      }
    } catch (err: any) {
      return { imported: 0, total: 0, flows: [], error: err.message };
    }

    const metaFlows: any[] = listData?.data || [];
    const result: WhatsAppFlow[] = [];

    for (const mf of metaFlows) {
      const metaFlowId = String(mf.id);
      try {
        // Intentar descargar el JSON (y cachear). Si no hay assets, igual
        // guardamos la metadata para que el Flow aparezca en la lista.
        let flow = await this.ensureFlowDefinition(tenantId, metaFlowId, inbox.id, true);
        if (!flow) {
          flow = await this.upsertMetadataOnly(tenantId, inbox.id, mf);
        }
        if (flow) result.push(flow);
      } catch (err: any) {
        this.logger.warn(`[FlowSync] No se pudo importar el Flow ${metaFlowId}: ${err.message}`);
        const flow = await this.upsertMetadataOnly(tenantId, inbox.id, mf);
        if (flow) result.push(flow);
      }
    }

    this.logger.log(
      `[FlowSync] Importados ${result.length}/${metaFlows.length} Flows de la WABA ${inbox.wabaId}`,
    );
    return { imported: result.length, total: metaFlows.length, flows: result };
  }

  /**
   * Guarda/actualiza solo la metadata del Flow (sin flow.json), para Flows que
   * aún no tienen assets descargables.
   */
  private async upsertMetadataOnly(
    tenantId: string,
    inboxId: string,
    mf: any,
  ): Promise<WhatsAppFlow> {
    const metaFlowId = String(mf.id);
    let flow = await this.flowRepo.findOne({ where: { tenantId, metaFlowId } });
    if (!flow) {
      flow = this.flowRepo.create({ tenantId, metaFlowId, inboxId });
    }
    flow.name = mf.name || flow.name || `flow_${metaFlowId}`;
    flow.status = String(mf.status || flow.status || 'draft').toLowerCase();
    flow.categories = mf.categories ?? flow.categories ?? null;
    flow.inboxId = inboxId;
    return this.flowRepo.save(flow);
  }

  /**
   * Descarga el flow.json desde /{flow_id}/assets.
   */
  private async downloadFlowJson(
    metaFlowId: string,
    accessToken: string,
  ): Promise<Record<string, any> | null> {
    try {
      const assetsRes = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${metaFlowId}/assets`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const assets = await assetsRes.json();
      if (!assetsRes.ok) {
        this.logger.warn(`[FlowSync] /assets error: ${JSON.stringify(assets.error || assets)}`);
        return null;
      }

      const asset = (assets.data || []).find(
        (a: any) => a?.asset_type === 'FLOW_JSON' || a?.name === 'flow.json',
      ) || (assets.data || [])[0];

      const downloadUrl = asset?.download_url;
      if (!downloadUrl) {
        this.logger.warn('[FlowSync] /assets no devolvió download_url');
        return null;
      }

      const jsonRes = await fetch(downloadUrl);
      if (!jsonRes.ok) {
        this.logger.warn(`[FlowSync] descarga de flow.json falló: HTTP ${jsonRes.status}`);
        return null;
      }
      return (await jsonRes.json()) as Record<string, any>;
    } catch (err: any) {
      this.logger.error(`[FlowSync] Error descargando flow.json: ${err.message}`);
      return null;
    }
  }

  /**
   * Metadata del Flow (nombre, estado, categorías).
   */
  private async fetchFlowMetadata(
    metaFlowId: string,
    accessToken: string,
  ): Promise<{ name?: string; status?: string; categories?: string[] } | null> {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${metaFlowId}?fields=name,status,categories`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const data = await res.json();
      if (!res.ok) return null;
      return { name: data.name, status: data.status, categories: data.categories };
    } catch {
      return null;
    }
  }

  /** Primera pantalla del routing_model (o la primera de screens[]). */
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

  /**
   * Resuelve un inbox de WhatsApp con access token para el tenant. Prefiere el
   * inbox indicado; si no, cualquiera conectado del tenant.
   */
  private async resolveInbox(
    tenantId: string,
    ...candidateIds: (string | null | undefined)[]
  ): Promise<Inbox | null> {
    for (const id of candidateIds) {
      if (id) {
        const inbox = await this.inboxRepo.findOne({ where: { id } });
        if (inbox?.accessToken && inbox.channel === 'whatsapp') return inbox;
      }
    }
    return this.inboxRepo.findOne({
      where: { tenantId, channel: 'whatsapp' },
    });
  }
}
