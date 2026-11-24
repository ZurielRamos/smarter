import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { TenantAdminGuard } from '../auth/tenant-admin.guard';
import { ModuleFeatureGuard } from '../auth/module-feature.guard';
import { RequiresFeature } from '../auth/requires-feature.decorator';
import { RewardLedgerService } from './reward-ledger.service';
import { Actor } from './validation';

const actorOf = (req: any): Actor => ({ id: req.user.id, email: req.user.email });

/** Pagos a encuestadores: saldos, movimientos y registro de pagos. Solo owner/admin con Reclutamiento. */
@Controller('reclutamiento/:tenantId')
@UseGuards(JwtAuthGuard, TenantAccessGuard, TenantAdminGuard, ModuleFeatureGuard)
@RequiresFeature('reclutamiento')
export class PayoutsController {
  constructor(private readonly ledger: RewardLedgerService) {}

  @Get('payouts/balances')
  balances(@Param('tenantId', ParseUUIDPipe) t: string, @Query('search') search?: string) {
    return this.ledger.balancesForTenant(t, { search });
  }

  @Get('profiles/:profileId/ledger')
  profileLedger(@Param('tenantId', ParseUUIDPipe) t: string, @Param('profileId', ParseUUIDPipe) p: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.ledger.ledgerForProfile(t, p, { page, limit });
  }

  @Post('profiles/:profileId/payouts')
  payout(@Param('tenantId', ParseUUIDPipe) t: string, @Param('profileId', ParseUUIDPipe) p: string, @Body() body: Record<string, unknown>, @Req() req: any) {
    return this.ledger.registerPayout(t, actorOf(req), p, body ?? {});
  }

  @Post('profiles/:profileId/adjustments')
  adjustment(@Param('tenantId', ParseUUIDPipe) t: string, @Param('profileId', ParseUUIDPipe) p: string, @Body() body: Record<string, unknown>, @Req() req: any) {
    return this.ledger.registerAdjustment(t, actorOf(req), p, body ?? {});
  }
}
