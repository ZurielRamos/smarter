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

/**
 * API de gestión y consulta de WhatsApp Flows y sus respuestas, por tenant.
 * Protegida con JWT + acceso al tenant, igual que forms/webhooks.
 */
@Controller('whatsapp-flows')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
export class FlowsController {
  constructor(
    private readonly flows: FlowsService,
    private readonly submissions: FlowSubmissionsService,
    private readonly sender: FlowSenderService,
    private readonly provisioning: FlowProvisioningService,
    private readonly sync: FlowSyncService,
  ) {}

  // ---- Definiciones de Flows ----

  @Get()
  findAll(@Query('tenantId') tenantId: string) {
    return this.flows.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.flows.findOne(id);
  }

  @Post()
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
  update(@Param('id') id: string, @Body() body: any) {
    return this.flows.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.flows.delete(id);
  }

  // ---- Provisión en Meta (crear + subir JSON + publicar) ----

  /**
   * Crea el Flow en Meta a partir de un flow.json, sube el JSON y
   * (opcionalmente) lo publica. Persiste la definición en la BD.
   */
  @Post('provision')
  provision(@Body() body: CreateFlowOnMetaInput) {
    return this.provisioning.createFlow(body);
  }

  /** Actualiza el flow.json del Flow (sube el asset a Meta) y lo persiste. */
  @Post(':id/flow-json')
  updateJson(@Param('id') id: string, @Body() body: { flowJson: Record<string, any> }) {
    return this.provisioning.updateFlowJson(id, body.flowJson);
  }

  /**
   * Valida el flow.json contra Meta (equivale al botón "Ejecutar" del editor):
   * devuelve los validation_errors con la ruta exacta del problema.
   */
  @Post(':id/validate')
  validate(@Param('id') id: string, @Body() body: { flowJson: Record<string, any> }) {
    return this.provisioning.validateFlowOnMeta(id, body.flowJson);
  }

  /** Publica un Flow local que está en DRAFT. */
  @Post(':id/publish')
  publish(@Param('id') id: string) {
    return this.provisioning.publishFlow(id);
  }

  /**
   * Importa los Flows ya existentes en la WABA del inbox (los creados en el
   * panel de Meta) hacia la BD, para que aparezcan en la lista.
   */
  @Post('import')
  import(@Body() body: { tenantId: string; inboxId: string }) {
    return this.sync.importFlowsFromInbox(body.tenantId, body.inboxId);
  }

  // ---- Respuestas (submissions) ----

  @Get('submissions/by-tenant')
  listSubmissions(@Query('tenantId') tenantId: string) {
    return this.submissions.findByTenant(tenantId);
  }

  @Get('submissions/by-record/:recordId')
  listByRecord(@Param('recordId') recordId: string) {
    return this.submissions.findByRecord(recordId);
  }

  @Get('submissions/by-flow/:flowId')
  listByFlow(@Param('flowId') flowId: string) {
    return this.submissions.findByFlow(flowId);
  }

  // ---- Envío de un Flow a un contacto ----

  // Interactivo directo (dentro de la ventana de 24h).
  @Post('send')
  send(@Body() body: SendFlowInput) {
    return this.sender.sendFlow(body);
  }

  // Vía plantilla aprobada (para iniciar conversación / campañas).
  @Post('send-template')
  sendTemplate(@Body() body: SendFlowTemplateInput) {
    return this.sender.sendFlowTemplate(body);
  }
}
