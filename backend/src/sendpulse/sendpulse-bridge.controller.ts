import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { SendPulseBridgeService } from './sendpulse-bridge.service';
import { TenantResource, TenantResourceGuard } from '../auth/tenant-resource.guard';

/**
 * Endpoints de configuración del Modo Puente de SendPulse, por bandeja.
 * Protegido con JWT + acceso al tenant (mismo patrón que ChatsController).
 */
@Controller('sendpulse/bridge')
@UseGuards(JwtAuthGuard, TenantAccessGuard, TenantResourceGuard)
export class SendPulseBridgeController {
  constructor(private readonly bridgeService: SendPulseBridgeService) {}

  /** Estado del puente + URL de webhook para una bandeja. */
  @Get(':inboxId')
  @TenantResource('inbox', 'inboxId')
  getStatus(@Param('inboxId') inboxId: string) {
    return this.bridgeService.getStatus(inboxId);
  }

  /** Activa el puente: valida API key, guarda config y encola la sync inicial. */
  @Post(':inboxId/activate')
  @TenantResource('inbox', 'inboxId')
  activate(
    @Param('inboxId') inboxId: string,
    @Body() body: { apiKey: string; botId?: string; tenantId?: string },
  ) {
    return this.bridgeService.activate(inboxId, body.apiKey, body.botId);
  }

  /** Desactiva el puente. */
  @Post(':inboxId/deactivate')
  @TenantResource('inbox', 'inboxId')
  deactivate(@Param('inboxId') inboxId: string, @Body() _body: { tenantId?: string }) {
    return this.bridgeService.deactivate(inboxId);
  }
}
