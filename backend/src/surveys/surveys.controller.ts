import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { Public } from '../auth/public.decorator';
import { SurveyAccessGuard } from './survey-access.guard';
import { SurveysService } from './surveys.service';

/**
 * API de Encuestas.
 *
 * Las encuestas son LOCALES: se crean y editan sin WhatsApp. Su contenido usa
 * el formato Meta Flow JSON, lo que permite (a) rellenarlas por enlace público
 * web y (b) opcionalmente publicarlas como WhatsApp Flow de Meta.
 *
 * Los endpoints de gestión van protegidos con JWT + acceso al tenant (ver
 * SurveyAccessGuard: resuelve el tenant desde la encuesta en las rutas `:id`);
 * los endpoints del enlace público (ver/rellenar por slug) son @Public.
 */
@Controller('surveys')
@UseGuards(JwtAuthGuard, TenantAccessGuard, SurveyAccessGuard)
export class SurveysController {
  constructor(private readonly surveys: SurveysService) {}

  // ---- Enlace público (sin autenticación) ----

  @Public()
  @Throttle({
    short: { limit: 10, ttl: 1000 },
    medium: { limit: 60, ttl: 60_000 },
  })
  @Get('public/:slug')
  findPublic(@Param('slug') slug: string) {
    return this.surveys.findPublicBySlug(slug);
  }

  /**
   * Envío de respuestas desde el enlace público. Límite por IP más estricto que
   * el global: 3 por segundo, 20 por minuto y 200 por hora.
   */
  @Public()
  @Throttle({
    short: { limit: 3, ttl: 1000 },
    medium: { limit: 20, ttl: 60_000 },
    long: { limit: 200, ttl: 3_600_000 },
  })
  @Post('public/:id/submit')
  submitPublic(
    @Param('id') id: string,
    @Body()
    body: {
      responseData?: unknown;
      respondentIdentifier?: unknown;
      location?: unknown;
      agentToken?: unknown;
    },
  ) {
    return this.surveys.submitPublic(
      id,
      body?.responseData,
      body?.respondentIdentifier,
      body?.location,
      body?.agentToken,
    );
  }

  // ---- Gestión (autenticada) ----

  @Get()
  findAll(@Query('tenantId') tenantId: string) {
    return this.surveys.findAll(tenantId);
  }

  /**
   * Encuestas publicadas como Flow en Meta (con metaFlowId). Alimenta el
   * selector del botón "FLOW" al crear plantillas de WhatsApp.
   */
  @Get('published-flows')
  listPublishedFlows(@Query('tenantId') tenantId: string) {
    return this.surveys.listPublishedFlows(tenantId);
  }

  /** Catálogo de campos del CRM para vincular (sistema + custom). */
  @Get('crm/targets')
  crmTargets(@Query('tenantId') tenantId: string) {
    return this.surveys.listCrmTargets(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.surveys.findOne(id);
  }

  @Get(':id/analytics')
  analytics(@Param('id') id: string) {
    return this.surveys.analytics(id);
  }

  /** Estado real del Flow en Meta (DRAFT/PUBLISHED) para esta encuesta. */
  @Get(':id/whatsapp-status')
  whatsAppStatus(@Param('id') id: string) {
    return this.surveys.getWhatsAppFlowStatus(id);
  }

  /** Actualiza el mapeo de campos al CRM y el campo de match. */
  @Put(':id/crm-mapping')
  updateCrmMapping(@Param('id') id: string, @Body() body: unknown) {
    return this.surveys.updateCrmMapping(id, body);
  }

  @Get(':id/responses')
  responses(@Param('id') id: string) {
    return this.surveys.findResponses(id);
  }

  /**
   * Crea una encuesta local (solo requiere tenantId + name). El usuario actual
   * queda como gestor de la encuesta por defecto.
   */
  @Post()
  create(
    @Req() req: any,
    @Body()
    body: { tenantId: string; name: string; description?: string; flowJson?: Record<string, any> },
  ) {
    return this.surveys.create({ ...body, managedByUserId: req.user?.id ?? null });
  }

  /** Cambia el usuario gestor (owner) de la encuesta. */
  @Put(':id/manager')
  setManager(@Param('id') id: string, @Body() body: { managedByUserId?: unknown }) {
    return this.surveys.setManager(id, body?.managedByUserId);
  }

  /**
   * Actualiza datos básicos (nombre, título, descripción, tema, ubicación,
   * metadata). El contenido (flowJson), el estado y el logo tienen sus propios
   * endpoints; cualquier otro campo del cuerpo se ignora.
   */
  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.surveys.update(id, body);
  }

  /** Sube el logo/imagen de header de la encuesta. */
  @Post(':id/logo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  uploadLogo(@Param('id') id: string, @UploadedFile() file: any) {
    return this.surveys.uploadLogo(id, file);
  }

  /** Elimina el logo de la encuesta. */
  @Delete(':id/logo')
  removeLogo(@Param('id') id: string) {
    return this.surveys.removeLogo(id);
  }

  /** Guarda el flow.json desde el constructor visual. */
  @Post(':id/flow-json')
  async saveFlowJson(@Param('id') id: string, @Body() body: { flowJson: Record<string, any> }) {
    const res = await this.surveys.saveFlowJson(id, body.flowJson);
    // Contrato compatible con el FlowBuilder: siempre guarda local (success),
    // pero informa si Meta rechazó la re-sincronización (validationErrors).
    const hasMetaErrors = !!res.metaErrors && res.metaErrors.length > 0;
    return {
      success: true,
      survey: res.survey,
      metaSynced: res.metaSynced,
      validationErrors: res.metaErrors,
      error: hasMetaErrors
        ? 'Guardado local, pero Meta rechazó la actualización del Flow. Corrige los errores para sincronizar WhatsApp.'
        : undefined,
    };
  }

  /** Devuelve el token de enlace del agente actual para esta encuesta. */
  @Post(':id/agent-link')
  agentLink(@Req() req: any, @Param('id') id: string) {
    return this.surveys.getAgentLinkToken(id, req.user?.id);
  }

  /** Activa la encuesta y genera el enlace público. */
  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.surveys.activate(id);
  }

  /** Archiva la encuesta (deja de estar disponible). */
  @Post(':id/archive')
  archive(@Param('id') id: string) {
    return this.surveys.archive(id);
  }

  /**
   * Valida el flow.json de la encuesta contra Meta SIN publicar (como el botón
   * "Ejecutar" del editor de Meta). Devuelve los errores con su ruta exacta.
   */
  @Post(':id/validate-whatsapp')
  validateWhatsApp(@Param('id') id: string, @Body() body: { inboxId: string }) {
    return this.surveys.validateOnMeta(id, body.inboxId);
  }

  /** Reintenta sincronizar el flow.json de la encuesta con Meta. */
  @Post(':id/retry-sync')
  retrySync(@Param('id') id: string) {
    return this.surveys.retryMetaSync(id);
  }

  /** Despublica/desvincula la encuesta de WhatsApp (intenta borrar el Flow). */
  @Post(':id/unpublish-whatsapp')
  unpublishWhatsApp(@Param('id') id: string) {
    return this.surveys.unpublishFromWhatsApp(id);
  }

  /** Publica la encuesta como WhatsApp Flow de Meta (opcional). */
  @Post(':id/publish-whatsapp')
  publishWhatsApp(
    @Param('id') id: string,
    @Body() body: { inboxId: string; publish?: boolean },
  ) {
    return this.surveys.publishToWhatsApp(id, body.inboxId, body.publish);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.surveys.remove(id);
  }
}
