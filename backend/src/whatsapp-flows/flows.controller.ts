import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { FlowsService } from './flows.service';
import { FlowSubmissionsService } from './flow-submissions.service';
import { FlowSenderService } from './flow-sender.service';
import type { SendFlowInput, SendFlowTemplateInput } from './flow-sender.service';
import { FlowProvisioningService } from './flow-provisioning.service';
import type { CreateFlowOnMetaInput } from './flow-provisioning.service';
import { FlowSyncService } from './flow-sync.service';
import { FlowEncryptionKeyService } from './flow-encryption-key.service';
import { ReadAction, TenantRefs, TenantResource, TenantResourceGuard } from '../auth/tenant-resource.guard';

/**
 * API de gestión y consulta de WhatsApp Flows y sus respuestas, por tenant.
 * Protegida con JWT + acceso al tenant, igual que forms/webhooks.
 */
@Controller('whatsapp-flows')
@UseGuards(JwtAuthGuard, TenantAccessGuard, TenantResourceGuard)
export class FlowsController {
  constructor(
    private readonly flows: FlowsService,
    private readonly submissions: FlowSubmissionsService,
    private readonly sender: FlowSenderService,
    private readonly provisioning: FlowProvisioningService,
    private readonly sync: FlowSyncService,
    private readonly keys: FlowEncryptionKeyService,
  ) {}

  // ---- Cifrado por canal (clave por número) ----

  /** Genera el par de claves del canal y registra la pública en Meta. */
  @Post('encryption/:inboxId/setup')
  @TenantResource('inbox', 'inboxId')
  setupEncryption(@Param('inboxId') inboxId: string, @Body() body: { force?: boolean }) {
    return this.keys.setupForInbox(inboxId, !!body?.force);
  }

  /** Estado de la clave de cifrado del canal (local + lo que reporta Meta). */
  @Get('encryption/:inboxId/status')
  @TenantResource('inbox', 'inboxId')
  encryptionStatus(@Param('inboxId') inboxId: string) {
    return this.keys.getStatus(inboxId);
  }

  // ---- Definiciones de Flows ----

  @Get()
  findAll(@Query('tenantId') tenantId: string) {
    return this.flows.findAll(tenantId);
  }

  @Get(':id')

  @TenantResource('waFlow')
  findOne(@Param('id') id: string) {
    return this.flows.findOne(id);
  }

  @Post()

  @TenantRefs({ kind: 'inbox', in: 'body', field: 'inboxId' })
  create(
    @Body()
    body: {
      tenantId: string;
      name: string;
      inboxId?: string;
      metaFlowId?: string;
      status?: string;
      categories?: string[];
      dataApiVersion?: string;
      entryScreen?: string;
      flowJson?: Record<string, any>;
      metadata?: Record<string, any>;
    },
  ) {
    return this.flows.create(body);
  }

  @Put(':id')

  @TenantResource('waFlow')

  @TenantRefs({ kind: 'inbox', in: 'body', field: 'inboxId' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.flows.update(id, body);
  }

  @Delete(':id')

  @TenantResource('waFlow')
  delete(@Param('id') id: string) {
    return this.flows.delete(id);
  }

  // ---- Provisión en Meta (crear + subir JSON + publicar) ----

  /**
   * Crea el Flow en Meta a partir de un flow.json, sube el JSON y
   * (opcionalmente) lo publica. Persiste la definición en la BD.
   */
  @Post('provision')
  @TenantRefs({ kind: 'inbox', in: 'body', field: 'inboxId' })
  provision(@Body() body: CreateFlowOnMetaInput) {
    return this.provisioning.createFlow(body);
  }

  /** Actualiza el flow.json del Flow (sube el asset a Meta) y lo persiste. */
  @Post(':id/flow-json')
  @TenantResource('waFlow')
  updateJson(@Param('id') id: string, @Body() body: { flowJson: Record<string, any> }) {
    return this.provisioning.updateFlowJson(id, body.flowJson);
  }

  /**
   * Valida el flow.json contra Meta (equivale al botón "Ejecutar" del editor):
   * devuelve los validation_errors con la ruta exacta del problema.
   */
  @Post(':id/validate')
  @TenantResource('waFlow')
  @ReadAction()
  validate(@Param('id') id: string, @Body() body: { flowJson: Record<string, any> }) {
    return this.provisioning.validateFlowOnMeta(id, body.flowJson);
  }

  /** Publica un Flow local que está en DRAFT. */
  @Post(':id/publish')
  @TenantResource('waFlow')
  publish(@Param('id') id: string) {
    return this.provisioning.publishFlow(id);
  }

  /**
   * Importa los Flows ya existentes en la WABA del inbox (los creados en el
   * panel de Meta) hacia la BD, para que aparezcan en la lista.
   */
  @Post('import')
  @TenantRefs({ kind: 'inbox', in: 'body', field: 'inboxId' })
  import(@Body() body: { tenantId: string; inboxId: string }) {
    return this.sync.importFlowsFromInbox(body.tenantId, body.inboxId);
  }

  // ---- Respuestas (submissions) ----

  @Get('submissions/by-tenant')
  listSubmissions(@Query('tenantId') tenantId: string) {
    return this.submissions.findByTenant(tenantId);
  }

  @Get('submissions/by-record/:recordId')

  @TenantResource('record', 'recordId')
  listByRecord(@Param('recordId') recordId: string) {
    return this.submissions.findByRecord(recordId);
  }

  @Get('submissions/by-flow/:flowId')

  @TenantResource('waFlow', 'flowId')
  listByFlow(@Param('flowId') flowId: string) {
    return this.submissions.findByFlow(flowId);
  }

  /** Una submission por id, con la definición del Flow (para el modal de chat). */
  @Get('submissions/:id')
  @TenantResource('waFlowSubmission')
  getSubmission(@Param('id') id: string) {
    return this.submissions.findByIdWithFlow(id);
  }

  // ---- Envío de un Flow a un contacto ----

  // Interactivo directo (dentro de la ventana de 24h).
  @Post('send')
  @TenantRefs({ kind: 'inbox', in: 'body', field: 'inboxId' }, { kind: 'conversation', in: 'body', field: 'conversationId' })
  send(@Body() body: SendFlowInput) {
    return this.sender.sendFlow(body);
  }

  // Vía plantilla aprobada (para iniciar conversación / campañas).
  @Post('send-template')
  @TenantRefs({ kind: 'inbox', in: 'body', field: 'inboxId' }, { kind: 'conversation', in: 'body', field: 'conversationId' })
  sendTemplate(@Body() body: SendFlowTemplateInput) {
    return this.sender.sendFlowTemplate(body);
  }
}
