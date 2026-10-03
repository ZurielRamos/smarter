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

  // ---- Respuestas (submissions) ----

  @Get('submissions/by-tenant')
  listSubmissions(@Query('tenantId') tenantId: string) {
    return this.submissions.findByTenant(tenantId);
  }

  @Get('submissions/by-record/:recordId')
  listByRecord(@Param('recordId') recordId: string) {
    return this.submissions.findByRecord(recordId);
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
