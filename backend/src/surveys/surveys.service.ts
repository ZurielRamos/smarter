import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Survey } from './survey.entity';
import { SurveyResponse } from './survey-response.entity';
import { FlowProvisioningService } from '../whatsapp-flows/flow-provisioning.service';
import { SurveyCrmService } from './survey-crm.service';
import { MediaStorageService } from '../media/media-storage.service';

/**
 * Plantilla mínima de encuesta en formato Meta Flow JSON. Una pantalla terminal
 * con un título y un campo de texto, lista para editar en el constructor
 * visual. Igual que la de WhatsApp Flows: así la estructura es compatible.
 */
function starterFlowJson(): Record<string, any> {
  return {
    version: '7.3',
    data_api_version: '3.0',
    routing_model: { SCREEN_INICIO: [] },
    screens: [
      {
        id: 'SCREEN_INICIO',
        title: 'Pantalla 1',
        terminal: true,
        success: true,
        data: {},
        layout: {
          type: 'SingleColumnLayout',
          children: [
            {
              type: 'Form',
              name: 'form_screen_inicio',
              children: [
                { type: 'TextHeading', text: 'Título de ejemplo' },
                {
                  type: 'TextInput',
                  name: 'respuesta',
                  label: 'Tu respuesta',
                  'input-type': 'text',
                  required: false,
                },
                {
                  type: 'Footer',
                  label: 'Enviar',
                  'on-click-action': {
                    name: 'complete',
                    payload: { respuesta: '${form.respuesta}' },
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

export interface SurveyQuestionAnalytics {
  name: string;
  question: string;
  screen: string;
  type: 'choice' | 'text' | 'boolean' | 'other';
  options?: Array<{ id: string; title: string; count: number; percentage: number }>;
  textSamples?: string[];
  answered: number;
}

export interface SurveyAnalytics {
  surveyId: string;
  name: string;
  status: string;
  totalResponses: number;
  byChannel: Record<string, number>;
  questions: SurveyQuestionAnalytics[];
}

@Injectable()
export class SurveysService {
  private readonly logger = new Logger(SurveysService.name);

  constructor(
    @InjectRepository(Survey)
    private readonly surveyRepo: Repository<Survey>,
    @InjectRepository(SurveyResponse)
    private readonly responseRepo: Repository<SurveyResponse>,
    private readonly provisioning: FlowProvisioningService,
    private readonly crm: SurveyCrmService,
    private readonly media: MediaStorageService,
  ) {}

  // ---- CRUD local ----

  findAll(tenantId: string): Promise<Survey[]> {
    return this.surveyRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  /**
   * Lista las encuestas del tenant que están PUBLICADAS como Flow en Meta
   * (tienen `metaFlowId`). Se usa para poblar el selector de botón "FLOW" al
   * crear una plantilla de WhatsApp. Devuelve una forma reducida con el id del
   * Flow en Meta y la primera pantalla (para `navigate_screen`).
   */
  async listPublishedFlows(
    tenantId: string,
  ): Promise<Array<{ id: string; name: string; metaFlowId: string; firstScreen: string | null }>> {
    const surveys = await this.surveyRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });

    // Candidatas: las que tienen metaFlowId (existen en Meta). Tener metaFlowId
    // NO garantiza que estén PUBLISHED (pueden quedar en DRAFT), así que se
    // verifica el estado real en Meta y solo se devuelven las publicadas. Esto
    // evita que el usuario arme una plantilla con una encuesta no publicada, que
    // Meta rechazaría ("Debe publicarse el flujo asociado con el botón").
    const candidates = surveys.filter((s) => !!s.metaFlowId);

    const checked = await Promise.all(
      candidates.map(async (s) => {
        const status = await this.provisioning
          .getFlowStatusOnMeta(tenantId, s.inboxId, s.metaFlowId as string)
          .catch(() => null);
        return { survey: s, status };
      }),
    );

    return checked
      .filter((c) => c.status === 'PUBLISHED')
      .map(({ survey: s }) => {
        const screens = Array.isArray(s.flowJson?.screens) ? s.flowJson!.screens : [];
        const firstScreen = screens.length > 0 ? String(screens[0]?.id ?? '') || null : null;
        return {
          id: s.id,
          name: s.name,
          metaFlowId: s.metaFlowId as string,
          firstScreen,
        };
      });
  }

  async findOne(id: string): Promise<Survey> {
    const survey = await this.surveyRepo.findOne({ where: { id } });
    if (!survey) throw new NotFoundException('Encuesta no encontrada');
    return survey;
  }

  /**
   * Estado real del Flow en Meta para esta encuesta (DRAFT | PUBLISHED | ...).
   * - linked=false: la encuesta no está vinculada a Meta (no es un Flow).
   * - status=null con linked=true: no se pudo consultar Meta ahora mismo.
   * Un Flow debe estar PUBLISHED para poder usarse en un botón de plantilla.
   */
  async getWhatsAppFlowStatus(
    id: string,
  ): Promise<{ linked: boolean; status: string | null }> {
    const survey = await this.findOne(id);
    if (!survey.metaFlowId) return { linked: false, status: null };
    const status = await this.provisioning
      .getFlowStatusOnMeta(survey.tenantId, survey.inboxId, survey.metaFlowId)
      .catch(() => null);
    return { linked: true, status };
  }

  /**
   * Crea una encuesta LOCAL. Solo requiere nombre; no toca WhatsApp. Nace en
   * borrador con una plantilla mínima editable (o el flowJson provisto).
   */
  async create(input: {
    tenantId: string;
    name: string;
    description?: string;
    flowJson?: Record<string, any>;
    managedByUserId?: string | null;
  }): Promise<Survey> {
    if (!input.tenantId) throw new BadRequestException('tenantId requerido');
    if (!input.name?.trim()) throw new BadRequestException('El nombre es obligatorio');

    const survey = this.surveyRepo.create({
      tenantId: input.tenantId,
      name: input.name.trim(),
      description: input.description ?? null,
      status: 'draft',
      flowJson: input.flowJson ?? starterFlowJson(),
      responseCount: 0,
      managedByUserId: input.managedByUserId ?? null,
    });
    return this.surveyRepo.save(survey);
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      displayTitle: string | null;
      description: string;
      logoUrl: string | null;
      theme: { primary?: string; background?: string } | null;
      requireLocation: boolean;
      flowJson: Record<string, any>;
      status: string;
      metadata: Record<string, any>;
      managedByUserId: string | null;
    }>,
  ): Promise<Survey> {
    const survey = await this.findOne(id);
    // Regla: requireLocation solo puede activarse si la encuesta NO está en
    // WhatsApp (Meta Flows no soporta geolocalización).
    if (data.requireLocation === true && survey.metaFlowId) {
      throw new BadRequestException(
        'No se puede requerir ubicación: la encuesta ya está publicada en WhatsApp. Despublícala primero.',
      );
    }
    Object.assign(survey, data);
    return this.surveyRepo.save(survey);
  }

  /**
   * Sube el logo/imagen de header de la encuesta a R2 y guarda su URL pública.
   * Reutiliza MediaStorageService (optimiza imágenes a webp).
   */
  async uploadLogo(
    id: string,
    file: { buffer: Buffer; mimetype: string; originalname?: string },
  ): Promise<Survey> {
    const survey = await this.findOne(id);
    if (!file?.buffer?.length) throw new BadRequestException('Archivo vacío');
    if (!/^image\//.test(file.mimetype)) {
      throw new BadRequestException('El logo debe ser una imagen');
    }
    const stored = await this.media.uploadBuffer(file.buffer, {
      channel: 'surveys',
      tenantId: survey.tenantId,
      conversationId: survey.id,
      messageId: 'logo',
      mimeType: file.mimetype,
      filename: file.originalname,
    });
    if (!stored?.url) {
      throw new BadRequestException('No se pudo subir la imagen (almacenamiento no disponible)');
    }
    // Borrar el logo anterior de R2 (si lo había) para no dejar huérfanos.
    const previous = survey.logoUrl;
    survey.logoUrl = stored.url;
    const saved = await this.surveyRepo.save(survey);
    if (previous && previous !== stored.url) {
      await this.media.deleteByUrl(previous).catch(() => undefined);
    }
    return saved;
  }

  /** Elimina el logo de la encuesta y lo borra del almacenamiento. */
  async removeLogo(id: string): Promise<Survey> {
    const survey = await this.findOne(id);
    const previous = survey.logoUrl;
    survey.logoUrl = null;
    const saved = await this.surveyRepo.save(survey);
    if (previous) await this.media.deleteByUrl(previous).catch(() => undefined);
    return saved;
  }

  /**
   * Guarda el flow.json desde el constructor. Siempre persiste en local. Si la
   * encuesta YA está vinculada a Meta (metaFlowId), además re-sube el flow.json
   * a Meta para mantener sincronizado el Flow publicado. Si Meta lo rechaza, el
   * cambio queda guardado localmente pero se devuelven los errores (sin dejar
   * el Flow de Meta en estado inconsistente: Meta ignora un asset inválido).
   */
  async saveFlowJson(
    id: string,
    flowJson: Record<string, any>,
  ): Promise<{
    survey: Survey;
    metaSynced: boolean;
    metaErrors?: Array<{ code?: string; type?: string; message: string; pointer?: string }>;
  }> {
    if (!flowJson || !Array.isArray(flowJson.screens) || flowJson.screens.length === 0) {
      throw new BadRequestException('flowJson inválido: sin pantallas');
    }
    const survey = await this.findOne(id);
    survey.flowJson = flowJson;
    const saved = await this.surveyRepo.save(survey);

    // Si no está en Meta, solo local (sin estado de sync).
    if (!survey.metaFlowId) {
      return { survey: saved, metaSynced: false };
    }

    // Está en Meta: re-subir el flow.json para sincronizar y registrar estado.
    const synced = await this.syncToMeta(saved);
    return {
      survey: synced.survey,
      metaSynced: synced.ok,
      metaErrors: synced.errors.length ? synced.errors : undefined,
    };
  }

  /**
   * Reintenta subir el flow.json actual de la encuesta a Meta y actualiza el
   * estado de sincronización. Útil cuando quedó "out_of_sync".
   */
  async retryMetaSync(id: string): Promise<{
    metaSynced: boolean;
    metaErrors?: Array<{ code?: string; type?: string; message: string; pointer?: string }>;
  }> {
    const survey = await this.findOne(id);
    if (!survey.metaFlowId) {
      throw new BadRequestException('La encuesta no está publicada en WhatsApp');
    }
    const res = await this.syncToMeta(survey);
    return { metaSynced: res.ok, metaErrors: res.errors.length ? res.errors : undefined };
  }

  /**
   * Sube el flow.json de la encuesta a Meta y persiste el estado de sync
   * (synced / out_of_sync) junto con los últimos errores. Centraliza la lógica
   * para que save y retry se comporten igual.
   */
  private async syncToMeta(survey: Survey): Promise<{
    survey: Survey;
    ok: boolean;
    errors: Array<{ code?: string; type?: string; message: string; pointer?: string }>;
  }> {
    try {
      const res = await this.provisioning.uploadFlowJsonToMeta(
        survey.tenantId,
        survey.inboxId,
        survey.metaFlowId!,
        survey.flowJson!,
      );
      if (!res.metaReachable) {
        survey.metaSyncStatus = 'out_of_sync';
        survey.metaSyncErrors = [
          { message: 'No se pudo contactar a Meta (revisa el canal de WhatsApp).' },
        ];
        const s = await this.surveyRepo.save(survey);
        return { survey: s, ok: false, errors: survey.metaSyncErrors };
      }
      const blocking = res.errors.filter((e) => e.type !== 'WARNING');
      if (res.ok && blocking.length === 0) {
        survey.metaSyncStatus = 'synced';
        survey.metaSyncErrors = null;
        const s = await this.surveyRepo.save(survey);
        return { survey: s, ok: true, errors: [] };
      }
      survey.metaSyncStatus = 'out_of_sync';
      survey.metaSyncErrors = res.errors;
      const s = await this.surveyRepo.save(survey);
      return { survey: s, ok: false, errors: res.errors };
    } catch (err: any) {
      this.logger.warn(`[Survey] Sincronización con Meta falló: ${err?.message}`);
      survey.metaSyncStatus = 'out_of_sync';
      survey.metaSyncErrors = [{ message: err?.message || 'Error al sincronizar con Meta.' }];
      const s = await this.surveyRepo.save(survey);
      return { survey: s, ok: false, errors: survey.metaSyncErrors };
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.surveyRepo.softDelete(id);
  }

  /**
   * Activa la encuesta para el enlace público (genera slug si no tiene). No
   * tiene nada que ver con WhatsApp: solo la hace disponible por web.
   */
  async activate(id: string): Promise<Survey> {
    const survey = await this.findOne(id);
    if (!survey.slug) survey.slug = this.generateSlug(survey.name);
    survey.status = 'active';
    return this.surveyRepo.save(survey);
  }

  async archive(id: string): Promise<Survey> {
    const survey = await this.findOne(id);
    survey.status = 'archived';
    return this.surveyRepo.save(survey);
  }

  // ---- Enlace público ----

  /** Devuelve la encuesta por slug para rellenarla por web (solo si activa). */
  async findPublicBySlug(slug: string): Promise<{
    id: string;
    name: string;
    displayTitle: string | null;
    description: string | null;
    logoUrl: string | null;
    theme: { primary?: string; background?: string } | null;
    requireLocation: boolean;
    flowJson: Record<string, any> | null;
  }> {
    const survey = await this.surveyRepo.findOne({ where: { slug } });
    if (!survey || survey.status === 'archived') {
      throw new NotFoundException('Encuesta no encontrada o no disponible');
    }
    return {
      id: survey.id,
      name: survey.name,
      displayTitle: survey.displayTitle,
      description: survey.description,
      logoUrl: survey.logoUrl,
      theme: survey.theme,
      requireLocation: survey.requireLocation,
      flowJson: survey.flowJson,
    };
  }

  /**
   * Devuelve (creando si no existe) el token de enlace del AGENTE para esta
   * encuesta. El token es opaco; se usa en /s/:slug?a=token para atribuir las
   * respuestas al agente sin exponer su userId.
   */
  async getAgentLinkToken(surveyId: string, userId: string): Promise<{ token: string }> {
    if (!userId) throw new BadRequestException('Usuario requerido');
    const survey = await this.findOne(surveyId);
    const tokens = survey.agentTokens || {};
    // Reusar token existente del agente si ya lo tiene.
    const existing = Object.entries(tokens).find(([, uid]) => uid === userId);
    if (existing) return { token: existing[0] };
    const token = `ag_${randomBytes(12).toString('hex')}`;
    survey.agentTokens = { ...tokens, [token]: userId };
    await this.surveyRepo.save(survey);
    return { token };
  }

  /** Registra una respuesta recibida por el enlace público web. */
  async submitPublic(
    surveyId: string,
    responseData: Record<string, any>,
    respondentIdentifier?: string,
    location?: { lat: number; lng: number; accuracy?: number } | null,
    agentToken?: string | null,
  ): Promise<{ success: boolean }> {
    const survey = await this.surveyRepo.findOne({ where: { id: surveyId } });
    if (!survey || survey.status === 'archived') {
      throw new NotFoundException('Encuesta no disponible');
    }
    // Si la encuesta requiere ubicación, debe venir en el envío.
    if (survey.requireLocation && (!location || typeof location.lat !== 'number')) {
      throw new BadRequestException('Esta encuesta requiere compartir tu ubicación.');
    }
    // Resolver el agente del enlace (si vino por un enlace de agente).
    const attributedUserId = agentToken ? survey.agentTokens?.[agentToken] || null : null;
    // La ubicación se guarda junto a la respuesta bajo una clave reservada.
    const data = location
      ? { ...responseData, __location__: location }
      : responseData;
    await this.recordResponse(survey, data, 'web', respondentIdentifier, attributedUserId);
    return { success: true };
  }

  /**
   * Ingesta una submission completada de WhatsApp Flows como respuesta de
   * encuesta, SI su metaFlowId corresponde a una Survey publicada en WhatsApp.
   * Evita duplicados por flow_token. (La atribución al agente es a nivel de
   * encuesta, no por respuesta.)
   */
  async ingestWhatsAppSubmission(submission: {
    tenantId: string;
    metaFlowId: string | null;
    flowToken: string | null;
    responseData: Record<string, any>;
    contactIdentifier: string | null;
  }): Promise<void> {
    if (!submission.metaFlowId) return;
    const survey = await this.surveyRepo.findOne({
      where: { tenantId: submission.tenantId, metaFlowId: submission.metaFlowId },
    });
    if (!survey) return; // la submission no es de una encuesta de este módulo

    // Evitar duplicar si ya ingerimos esta submission (por flow_token).
    if (submission.flowToken) {
      const existing = await this.responseRepo.findOne({
        where: { surveyId: survey.id, respondentIdentifier: submission.flowToken },
      });
      if (existing) return;
    }

    await this.recordResponse(
      survey,
      submission.responseData || {},
      'whatsapp',
      submission.flowToken || submission.contactIdentifier || undefined,
    );
  }

  /**
   * Registra una respuesta en cualquier canal, hace merge del contador y
   * devuelve la respuesta persistida. Reutilizable por el canal de WhatsApp.
   */
  async recordResponse(
    survey: Survey,
    responseData: Record<string, any>,
    channel: 'web' | 'whatsapp' | 'api',
    respondentIdentifier?: string,
    attributedUserId?: string | null,
  ): Promise<SurveyResponse> {
    // Atribuir al CRM según el mapeo de la encuesta (crear/actualizar contacto).
    // No bloquea el guardado de la respuesta si algo falla.
    let recordId: string | null = null;
    try {
      recordId = await this.crm.attribute(survey, responseData || {}, channel);
    } catch (err: any) {
      this.logger.warn(`[Survey] Atribución al CRM falló: ${err?.message}`);
    }

    // Si no se pasó un identificador explícito, derivar uno legible del propio
    // responseData (nombre o email) para no mostrar "Anónimo" en la lista.
    const identifier =
      respondentIdentifier ?? this.deriveRespondentIdentifier(responseData || {});

    const response = this.responseRepo.create({
      tenantId: survey.tenantId,
      surveyId: survey.id,
      channel,
      status: 'completed',
      responseData: responseData || {},
      respondentIdentifier: identifier,
      recordId,
      attributedUserId: attributedUserId ?? null,
    });
    const saved = await this.responseRepo.save(response);
    await this.surveyRepo.increment({ id: survey.id }, 'responseCount', 1);
    return saved;
  }

  /** Actualiza el mapeo de campos al CRM y el campo de match. */
  async updateCrmMapping(
    id: string,
    mapping: { fields?: Record<string, string>; matchField?: string | null },
  ): Promise<Survey> {
    const survey = await this.findOne(id);
    survey.crmMapping = mapping;
    return this.surveyRepo.save(survey);
  }

  /** Catálogo de campos del CRM a los que mapear (sistema + custom). */
  listCrmTargets(tenantId: string) {
    return this.crm.listTargets(tenantId);
  }

  findResponses(id: string): Promise<SurveyResponse[]> {
    return this.responseRepo.find({ where: { surveyId: id }, order: { createdAt: 'DESC' } });
  }

  // ---- Conversión OPCIONAL a Flow de Meta ----

  /**
   * Publica la encuesta como WhatsApp Flow de Meta reutilizando el provisioning
   * de Flows. Solo aquí se toca Meta. Vincula metaFlowId e inboxId a la
   * encuesta. La estructura (flowJson) ya es compatible, así que se sube tal
   * cual, forzando la categoría SURVEY.
   */
  async publishToWhatsApp(
    id: string,
    inboxId: string,
    publish = false,
  ): Promise<{
    success: boolean;
    metaFlowId: string | null;
    status: string | null;
    error?: string;
    validationErrors?: any[];
  }> {
    const survey = await this.findOne(id);
    if (!survey.flowJson) throw new BadRequestException('La encuesta no tiene contenido');
    if (!inboxId) throw new BadRequestException('inboxId requerido');
    if (survey.requireLocation) {
      throw new BadRequestException(
        'Esta encuesta requiere ubicación y no se puede publicar en WhatsApp. Desactiva "Requerir ubicación" para publicarla.',
      );
    }

    // La encuesta YA está vinculada a un Flow en Meta (existe en DRAFT): no se
    // debe re-crear (Meta rechazaría por nombre duplicado / "ya publicado").
    // Si se pide publicar, se publica el Flow EXISTENTE (DRAFT -> PUBLISHED).
    if (survey.metaFlowId) {
      if (!publish) {
        // Ya existe y no se pide publicar: nada que hacer, está vinculado.
        const status = await this.provisioning
          .getFlowStatusOnMeta(survey.tenantId, survey.inboxId ?? inboxId, survey.metaFlowId)
          .catch(() => null);
        return { success: true, metaFlowId: survey.metaFlowId, status };
      }
      const pub = await this.provisioning.publishExistingFlowOnMeta(
        survey.tenantId,
        survey.inboxId ?? inboxId,
        survey.metaFlowId,
      );
      if (!pub.ok) {
        return {
          success: false,
          metaFlowId: survey.metaFlowId,
          status: 'DRAFT',
          error: pub.error || 'No se pudo publicar el Flow en Meta',
        };
      }
      survey.metaSyncStatus = 'synced';
      survey.metaSyncErrors = null;
      await this.surveyRepo.save(survey);
      return { success: true, metaFlowId: survey.metaFlowId, status: 'PUBLISHED' };
    }

    const result = await this.provisioning.createFlow({
      tenantId: survey.tenantId,
      inboxId,
      name: survey.name,
      categories: ['SURVEY'] as any,
      flowJson: survey.flowJson,
      publish,
    });

    if (result.success || result.metaFlowId) {
      survey.metaFlowId = result.metaFlowId;
      survey.inboxId = inboxId;
      // Estado de sync según el resultado de la subida inicial.
      const errs = (result.validationErrors || []).map((e: any) => ({
        code: e.error ?? e.code,
        type: e.error_type ?? e.type,
        message: e.message || String(e),
        pointer: e.pointers?.[0]?.path ?? e.pointer,
      }));
      const blocking = errs.filter((e) => e.type !== 'WARNING');
      if (result.success && blocking.length === 0) {
        survey.metaSyncStatus = 'synced';
        survey.metaSyncErrors = null;
      } else {
        survey.metaSyncStatus = 'out_of_sync';
        survey.metaSyncErrors = errs.length ? errs : null;
      }
      await this.surveyRepo.save(survey);
    }

    return {
      success: result.success,
      metaFlowId: result.metaFlowId,
      status: result.status,
      error: result.error,
      // Propagar los errores de validación de Meta (con su ruta exacta) para
      // mostrarlos en el frontend, como hace el editor de Meta.
      validationErrors: result.validationErrors,
    };
  }

  /**
   * Despublica la encuesta de WhatsApp: intenta eliminar el Flow en Meta y, en
   * cualquier caso, desvincula la encuesta localmente (metaFlowId/inboxId null,
   * estado de sync limpio). Si Meta no permitió borrarlo (Flow en uso), se
   * informa pero la encuesta queda desvinculada igualmente.
   */
  async unpublishFromWhatsApp(
    id: string,
  ): Promise<{ success: boolean; deletedOnMeta: boolean; warning?: string }> {
    const survey = await this.findOne(id);
    if (!survey.metaFlowId) {
      throw new BadRequestException('La encuesta no está publicada en WhatsApp');
    }

    let deletedOnMeta = false;
    let warning: string | undefined;
    const res = await this.provisioning.deleteFlowOnMeta(
      survey.tenantId,
      survey.inboxId,
      survey.metaFlowId,
    );
    if (res.ok) {
      deletedOnMeta = true;
    } else {
      warning = `La encuesta se desvinculó, pero el Flow sigue en Meta: ${res.error}`;
    }

    // Desvincular localmente SIEMPRE.
    survey.metaFlowId = null;
    survey.inboxId = null;
    survey.metaSyncStatus = null;
    survey.metaSyncErrors = null;
    await this.surveyRepo.save(survey);

    return { success: true, deletedOnMeta, warning };
  }

  /**
   * Valida el flowJson de la encuesta contra el validador de Meta SIN publicar
   * (equivale al botón "Ejecutar" del editor de Meta). Devuelve los errores con
   * su ruta exacta. Requiere un inbox de WhatsApp para hablar con Meta.
   */
  async validateOnMeta(
    id: string,
    inboxId: string,
  ): Promise<{
    valid: boolean;
    errors: Array<{ code?: string; type?: string; message: string; pointer?: string }>;
    metaReachable: boolean;
  }> {
    const survey = await this.findOne(id);
    if (!survey.flowJson) throw new BadRequestException('La encuesta no tiene contenido');
    if (!inboxId) throw new BadRequestException('Selecciona un canal de WhatsApp para validar');
    return this.provisioning.validateFlowJsonOnMeta(survey.tenantId, inboxId, survey.flowJson);
  }

  // ---- Analíticas ----

  async analytics(id: string): Promise<SurveyAnalytics> {
    const survey = await this.findOne(id);
    const responses = await this.responseRepo.find({ where: { surveyId: id } });

    const byChannel: Record<string, number> = {};
    for (const r of responses) {
      byChannel[r.channel] = (byChannel[r.channel] || 0) + 1;
    }

    const fields = this.extractFields(survey.flowJson);
    const data = responses.map((r) => r.responseData || {});

    const questions: SurveyQuestionAnalytics[] = fields.map((field) => {
      const values = data
        .map((r) => r[field.name])
        .filter((v) => v !== undefined && v !== null && v !== '');
      const answered = values.length;

      if (field.options && field.options.length > 0) {
        const counts = new Map<string, number>();
        for (const v of values) {
          const arr = Array.isArray(v) ? v : [v];
          for (const item of arr) {
            const key = String(item);
            counts.set(key, (counts.get(key) || 0) + 1);
          }
        }
        const totalChoices = Array.from(counts.values()).reduce((a, b) => a + b, 0) || 1;
        return {
          name: field.name,
          question: field.question,
          screen: field.screen,
          type: 'choice',
          options: field.options.map((o) => {
            const count = counts.get(o.id) || 0;
            return {
              id: o.id,
              title: o.title,
              count,
              percentage: Math.round((count / totalChoices) * 1000) / 10,
            };
          }),
          answered,
        };
      }

      if (field.boolean) {
        return {
          name: field.name,
          question: field.question,
          screen: field.screen,
          type: 'boolean',
          options: this.booleanBuckets(values),
          answered,
        };
      }

      return {
        name: field.name,
        question: field.question,
        screen: field.screen,
        type: 'text',
        textSamples: values.slice(-20).map((v) => String(v)),
        answered,
      };
    });

    return {
      surveyId: survey.id,
      name: survey.name,
      status: survey.status,
      totalResponses: responses.length,
      byChannel,
      questions,
    };
  }

  // ---- Helpers ----

  /**
   * Deriva un identificador legible del encuestado desde los valores de la
   * respuesta (nombre, nombre completo, o email), para mostrarlo en la lista en
   * vez de "Anónimo". Ignora la clave reservada de ubicación.
   */
  private deriveRespondentIdentifier(data: Record<string, any>): string | null {
    const pick = (...keys: string[]): string | null => {
      for (const k of keys) {
        const v = data[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
      return null;
    };
    // Claves comunes de nombre/email (coinciden con los mapeos típicos del CRM).
    const name = pick(
      'nombre', 'name', 'full_name', 'fullName', 'nombre_completo',
      'first_name', 'firstName',
    );
    const email = pick('email', 'correo', 'correo_electronico');
    if (name && email) return `${name} · ${email}`;
    return name || email || null;
  }

  private generateSlug(name: string): string {
    const base = (name || 'encuesta')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    const suffix = randomBytes(4).toString('hex');
    return `${base || 'encuesta'}-${suffix}`;
  }

  private booleanBuckets(
    values: any[],
  ): Array<{ id: string; title: string; count: number; percentage: number }> {
    let yes = 0;
    let no = 0;
    for (const v of values) {
      if (v === true || v === 'true' || v === 1 || v === '1') yes++;
      else no++;
    }
    const total = yes + no || 1;
    return [
      { id: 'true', title: 'Sí', count: yes, percentage: Math.round((yes / total) * 1000) / 10 },
      { id: 'false', title: 'No', count: no, percentage: Math.round((no / total) * 1000) / 10 },
    ];
  }

  /**
   * Extrae campos (preguntas) del flowJson en orden natural, resolviendo
   * label/pregunta y opciones. Reconoce el componente condicional If.
   */
  private extractFields(flowJson?: Record<string, any> | null): Array<{
    name: string;
    question: string;
    screen: string;
    options?: Array<{ id: string; title: string }>;
    boolean?: boolean;
  }> {
    const out: Array<{
      name: string;
      question: string;
      screen: string;
      options?: Array<{ id: string; title: string }>;
      boolean?: boolean;
    }> = [];
    const seen = new Set<string>();
    if (!flowJson?.screens || !Array.isArray(flowJson.screens)) return out;

    const TEXT_TYPES = new Set([
      'TextHeading',
      'TextSubheading',
      'TextBody',
      'TextCaption',
      'RichText',
    ]);

    for (const screen of flowJson.screens) {
      const screenTitle = screen.title || screen.id || '';
      const walk = (children: any[]) => {
        let lastText: string | null = null;
        for (const node of children || []) {
          if (!node || typeof node !== 'object') continue;
          if (TEXT_TYPES.has(node.type) && typeof node.text === 'string') {
            lastText = node.text;
            continue;
          }
          if (node.name && (node.label != null || node['data-source'] || node.type === 'OptIn')) {
            const name = String(node.name);
            if (!seen.has(name)) {
              const options = Array.isArray(node['data-source'])
                ? node['data-source'].map((o: any) => ({
                    id: String(o.id),
                    title: String(o.title),
                  }))
                : undefined;
              out.push({
                name,
                question: this.clean(lastText) || node.label || name,
                screen: screenTitle,
                options,
                boolean: node.type === 'OptIn',
              });
              seen.add(name);
            }
            lastText = null;
          }
          if (Array.isArray(node.children)) walk(node.children);
          if (Array.isArray(node.then)) walk(node.then);
          if (Array.isArray(node.else)) walk(node.else);
        }
      };
      const layoutChildren: any[] = screen.layout?.children || [];
      for (const c of layoutChildren) {
        if (c?.type === 'Form' && Array.isArray(c.children)) walk(c.children);
        else walk([c]);
      }
    }
    return out;
  }

  private clean(text: string | null): string | null {
    if (!text) return null;
    const t = text.replace(/\s+/g, ' ').trim();
    return t.length ? t : null;
  }
}
