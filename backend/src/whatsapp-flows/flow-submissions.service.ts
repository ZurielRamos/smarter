import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppFlowSubmission } from './entities/whatsapp-flow-submission.entity';
import { WhatsAppFlow } from './entities/whatsapp-flow.entity';
import { ClientRecord } from '../records/record.entity';
import { Conversation } from '../chats/conversation.entity';

/**
 * Datos para iniciar/registrar una submission cuando se ENVÍA un Flow a un
 * contacto. El flow_token lo genera quien envía el Flow y debe guardarse aquí
 * para poder correlacionar las respuestas que lleguen al endpoint cifrado.
 */
export interface StartSubmissionInput {
  tenantId: string;
  flowToken: string;
  inboxId?: string | null;
  recordId?: string | null;
  conversationId?: string | null;
  contactIdentifier?: string | null;
  metaFlowId?: string | null;
  flowId?: string | null;
}

/**
 * Actualización de una submission a partir de un data_exchange del endpoint.
 */
export interface RecordScreenInput {
  flowToken: string;
  screen: string;
  data: Record<string, any>;
  completed?: boolean;
  tenantIdFallback?: string;
}

/**
 * Persistencia de respuestas de WhatsApp Flows, vinculadas a tenant, inbox,
 * contacto (ClientRecord) y conversación.
 */
@Injectable()
export class FlowSubmissionsService {
  private readonly logger = new Logger(FlowSubmissionsService.name);

  constructor(
    @InjectRepository(WhatsAppFlowSubmission)
    private readonly submissionRepo: Repository<WhatsAppFlowSubmission>,
    @InjectRepository(WhatsAppFlow)
    private readonly flowRepo: Repository<WhatsAppFlow>,
    @InjectRepository(ClientRecord)
    private readonly recordRepo: Repository<ClientRecord>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
  ) {}

  /**
   * Crea (o devuelve, si ya existe) la submission para un flow_token.
   * Se llama al enviar el Flow al usuario, de modo que las respuestas
   * posteriores ya tengan el contacto resuelto.
   */
  async startSubmission(input: StartSubmissionInput): Promise<WhatsAppFlowSubmission> {
    const existing = await this.submissionRepo.findOne({
      where: { flowToken: input.flowToken },
    });
    if (existing) return existing;

    const submission = this.submissionRepo.create({
      tenantId: input.tenantId,
      flowToken: input.flowToken,
      inboxId: input.inboxId ?? null,
      recordId: input.recordId ?? null,
      conversationId: input.conversationId ?? null,
      contactIdentifier: input.contactIdentifier ?? null,
      metaFlowId: input.metaFlowId ?? null,
      flowId: input.flowId ?? null,
      status: 'started',
      responseData: {},
      screenHistory: [],
    });
    return this.submissionRepo.save(submission);
  }

  /**
   * Registra los datos de una pantalla recibidos por el endpoint cifrado.
   * Hace merge en response_data, agrega al historial y, si `completed`,
   * marca la submission como finalizada.
   *
   * Si no existe una submission previa para el flow_token (p. ej. el Flow se
   * envió sin registrar el token), se crea una sobre la marcha usando el
   * tenant de respaldo e intentando resolver el contacto después.
   */
  async recordScreen(input: RecordScreenInput): Promise<WhatsAppFlowSubmission | null> {
    const { flowToken, screen, data, completed } = input;

    let submission = flowToken
      ? await this.submissionRepo.findOne({ where: { flowToken } })
      : null;

    if (!submission) {
      if (!input.tenantIdFallback) {
        // Sin submission previa ni tenant conocido no podemos persistir con
        // seguridad multi-tenant; solo registramos el aviso.
        this.logger.warn(
          `[FlowSubmission] data_exchange sin submission previa ni tenant para flow_token=${flowToken}`,
        );
        return null;
      }
      submission = this.submissionRepo.create({
        tenantId: input.tenantIdFallback,
        flowToken: flowToken || null,
        status: 'started',
        responseData: {},
        screenHistory: [],
      });
    }

    submission.responseData = { ...(submission.responseData || {}), ...data };
    submission.currentScreen = screen;
    submission.screenHistory = [
      ...(submission.screenHistory || []),
      { screen, data, at: new Date().toISOString() },
    ];
    submission.status = completed ? 'completed' : 'in_progress';
    if (completed) submission.completedAt = new Date();

    // Vincular la submission con la definición local del Flow si falta el
    // flow_id. Las respuestas disparadas desde plantillas llegan con
    // meta_flow_id pero sin flow_id local; sin este enlace no aparecen en la
    // vista "Respuestas" (que consulta por flow_id).
    if (!submission.flowId && submission.metaFlowId && submission.tenantId) {
      const flow = await this.flowRepo.findOne({
        where: { tenantId: submission.tenantId, metaFlowId: submission.metaFlowId },
      });
      if (flow) submission.flowId = flow.id;
    }

    const saved = await this.submissionRepo.save(submission);

    // Al completar, intenta reflejar los datos en el contacto si está vinculado.
    if (completed && saved.recordId) {
      await this.syncToRecord(saved).catch((err) =>
        this.logger.warn(`[FlowSubmission] No se pudo sincronizar al contacto: ${err.message}`),
      );
    }

    return saved;
  }

  /**
   * Vuelca campos reconocibles de la respuesta del Flow al ClientRecord
   * (nombre, email, teléfono, etc.) sin pisar datos existentes, y guarda el
   * resto en custom_data bajo la clave del flow_token.
   */
  private async syncToRecord(submission: WhatsAppFlowSubmission): Promise<void> {
    if (!submission.recordId) return;
    const record = await this.recordRepo.findOne({ where: { id: submission.recordId } });
    if (!record) return;

    const data = submission.responseData || {};
    const pick = (...keys: string[]): string | undefined => {
      for (const k of keys) {
        if (data[k] != null && String(data[k]).trim() !== '') return String(data[k]);
      }
      return undefined;
    };

    const firstName = pick('nombre', 'first_name', 'firstName', 'name');
    const lastName = pick('apellidos', 'last_name', 'lastName');
    const email = pick('email', 'correo');
    const phone = pick('telefono', 'phone', 'celular');

    if (firstName && !record.firstName) record.firstName = firstName;
    if (lastName && !record.lastName) record.lastName = lastName;
    if (email && !record.email) record.email = email;
    if (phone && !record.phone) record.phone = phone.replace(/^\+/, '');

    // Guarda la respuesta completa del Flow en custom_data para no perder nada.
    const customData = (record.customData as Record<string, any>) || {};
    customData.whatsapp_flows = customData.whatsapp_flows || {};
    customData.whatsapp_flows[submission.flowToken || submission.id] = data;
    record.customData = customData;

    await this.recordRepo.save(record);
  }

  // ---- Consultas ----

  findByTenant(tenantId: string): Promise<WhatsAppFlowSubmission[]> {
    return this.submissionRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  findByRecord(recordId: string): Promise<WhatsAppFlowSubmission[]> {
    // Incluir la definición del Flow (flowJson) para que el frontend pueda
    // mostrar las preguntas y los títulos de las opciones, no los ids crudos.
    return this.submissionRepo.find({
      where: { recordId },
      relations: { flow: true },
      order: { createdAt: 'DESC' },
    });
  }

  findByFlowToken(flowToken: string): Promise<WhatsAppFlowSubmission | null> {
    return this.submissionRepo.findOne({ where: { flowToken } });
  }

  findByFlow(flowId: string): Promise<WhatsAppFlowSubmission[]> {
    return this.submissionRepo.find({
      where: { flowId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Resuelve la definición del Flow (WhatsAppFlow) asociada a un flow_token.
   * Primero busca la submission para obtener flowId/metaFlowId y, con eso,
   * carga la definición. Devuelve null si no hay forma de resolverla.
   */
  async resolveFlowByToken(flowToken: string): Promise<WhatsAppFlow | null> {
    if (!flowToken) return null;
    const submission = await this.submissionRepo.findOne({ where: { flowToken } });
    if (!submission) return null;

    if (submission.flowId) {
      const byId = await this.flowRepo.findOne({ where: { id: submission.flowId } });
      if (byId) return byId;
    }
    if (submission.metaFlowId) {
      const byMeta = await this.flowRepo.findOne({
        where: { tenantId: submission.tenantId, metaFlowId: submission.metaFlowId },
      });
      if (byMeta) return byMeta;
    }
    return null;
  }
}
