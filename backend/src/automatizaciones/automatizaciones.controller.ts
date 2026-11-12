import {
  All,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { ModuleFeatureGuard } from '../auth/module-feature.guard';
import { RequiresFeature } from '../auth/requires-feature.decorator';
import { AutomatizacionesService } from './automatizaciones.service';
import {
  CreateAutomationDto,
  RunAutomationDto,
  SaveConnectionDto,
  UpdateAutomationDto,
} from './dto/automation.dto';

/**
 * API autenticada del módulo Automatizaciones. Todas las rutas llevan
 * tenantId (query o body) para TenantAccessGuard y ModuleFeatureGuard.
 * Las rutas estáticas van antes de `:id`.
 */
@Controller('automatizaciones')
@UseGuards(JwtAuthGuard, TenantAccessGuard, ModuleFeatureGuard)
@RequiresFeature('automatizaciones')
export class AutomatizacionesController {
  constructor(private readonly svc: AutomatizacionesService) {}

  @Get()
  findAll(@Query('tenantId') tenantId: string) {
    return this.svc.findAll(tenantId);
  }

  @Get('inboxes')
  inboxes(@Query('tenantId') tenantId: string) {
    return this.svc.listInboxes(tenantId);
  }

  // ── Conexiones ──
  @Get('connection-types')
  connectionTypes() {
    return this.svc.getConnectionTypes();
  }

  @Get('connections')
  listConnections(@Query('tenantId') tenantId: string) {
    return this.svc.listConnections(tenantId);
  }

  @Post('connections')
  createConnection(@Body() dto: SaveConnectionDto) {
    return this.svc.createConnection(dto);
  }

  @Put('connections/:connId')
  updateConnection(
    @Param('connId', ParseUUIDPipe) connId: string,
    @Body() dto: SaveConnectionDto,
  ) {
    return this.svc.updateConnection(connId, dto);
  }

  @Delete('connections/:connId')
  async removeConnection(
    @Param('connId', ParseUUIDPipe) connId: string,
    @Query('tenantId') tenantId: string,
  ) {
    await this.svc.removeConnection(connId, tenantId);
    return { success: true };
  }

  // ── Historial global ──
  @Get('runs')
  listTenantRuns(@Query('tenantId') tenantId: string, @Query('limit') limit?: string) {
    return this.svc.listTenantRuns(tenantId, Number(limit));
  }

  @Get('runs/:runId')
  getRun(
    @Param('runId', ParseUUIDPipe) runId: string,
    @Query('tenantId') tenantId: string,
  ) {
    return this.svc.getRun(runId, tenantId);
  }

  // ── CRUD ──
  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('tenantId') tenantId: string,
  ) {
    return this.svc.findOne(id, tenantId);
  }

  @Post()
  create(@Body() dto: CreateAutomationDto) {
    return this.svc.create(dto);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAutomationDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('tenantId') tenantId: string,
  ) {
    await this.svc.remove(id, tenantId);
    return { success: true };
  }

  @Post(':id/duplicate')
  duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('tenantId') tenantId: string,
  ) {
    return this.svc.duplicate(id, tenantId);
  }

  @Post(':id/rotate-webhook')
  rotate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('tenantId') tenantId: string,
  ) {
    return this.svc.rotateWebhookToken(id, tenantId);
  }

  @Post(':id/run')
  run(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RunAutomationDto,
  ) {
    return this.svc.runManual(id, dto.tenantId, dto.input);
  }

  @Get(':id/runs')
  listRuns(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('tenantId') tenantId: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.listRuns(id, tenantId, Number(limit));
  }
}

/**
 * Entrada pública de los disparadores webhook. No usa JWT: la autenticación
 * es el token secreto de la URL (y opcionalmente x-webhook-secret).
 */
@Controller('automatizaciones/hooks')
export class AutomationHooksController {
  constructor(private readonly svc: AutomatizacionesService) {}

  @All(':token')
  @Throttle({ short: { limit: 10, ttl: 1000 }, medium: { limit: 120, ttl: 60000 } })
  handle(
    @Param('token') token: string,
    @Req() req: Request,
    @Query('wait') wait?: string,
  ) {
    return this.svc.handleWebhook(
      token,
      {
        body: req.body,
        query: req.query,
        headers: req.headers as Record<string, unknown>,
        method: req.method.toUpperCase(),
      },
      wait === '1' || wait === 'true',
    );
  }
}
