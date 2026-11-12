import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { ChatsSyncService } from './chats-sync.service';

/**
 * Endpoints de sincronización incremental (app móvil).
 *
 * `tenantId` es obligatorio: sin él `TenantAccessGuard` no validaría membresía.
 * Se exime del throttling global (20 req/s) porque una puesta al día legítima
 * pagina varias veces seguidas.
 */
@SkipThrottle()
@Controller('chats/sync')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
export class ChatsSyncController {
  constructor(private readonly syncService: ChatsSyncService) {}

  @Get('conversations')
  conversations(
    @Query('tenantId') tenantId?: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    if (!tenantId) throw new BadRequestException('tenantId es obligatorio');
    return this.syncService.syncConversations(tenantId, since, limit);
  }

  @Get('messages')
  messages(
    @Query('tenantId') tenantId?: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    if (!tenantId) throw new BadRequestException('tenantId es obligatorio');
    return this.syncService.syncMessages(tenantId, since, limit);
  }
}
