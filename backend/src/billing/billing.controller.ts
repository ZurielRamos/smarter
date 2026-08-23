import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { BillingService } from './billing.service';
import { CreatePlanDto, RechargeDto } from './dto';
import { AuditService } from '../audit/audit.service';

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly auditService: AuditService,
  ) {}

  // ─── COSTOS (rutas estáticas primero) ───────────────

  @Get('config/costs')
  @UseGuards(SuperAdminGuard)
  getAllCosts() {
    return this.billingService.getAllCosts();
  }

  @Post('config/costs')
  @UseGuards(SuperAdminGuard)
  async upsertCost(@Body() body: { action: string; label: string; cost: number }, @Req() req: any) {
    const result = await this.billingService.upsertCost(body.action, body.label, body.cost);

    await this.auditService.log({
      adminUserId: req.user.id,
      adminEmail: req.user.email,
      action: 'billing.global_costs.update',
      targetType: 'platform',
      targetId: null,
      targetLabel: null,
      metadata: { costAction: body.action, label: body.label, cost: body.cost },
    });

    return result;
  }

  @Get('config/default-model')
  @UseGuards(SuperAdminGuard)
  getDefaultModel() {
    return this.billingService.getDefaultModel();
  }

  @Post('config/default-model')
  @UseGuards(SuperAdminGuard)
  setDefaultModel(@Body() body: { model: string }) {
    return this.billingService.setDefaultModel(body.model);
  }

  // ─── TENANT COST OVERRIDES ─────────────────────────

  @Get('config/tenant-costs/:tenantId')
  @UseGuards(SuperAdminGuard)
  getTenantCosts(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.billingService.getTenantCosts(tenantId);
  }

  @Post('config/tenant-costs/:tenantId')
  @UseGuards(SuperAdminGuard)
  async upsertTenantCost(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() body: { action: string; cost: number | null },
    @Req() req: any,
  ) {
    let result;
    if (body.cost === null || body.cost === 0) {
      result = await this.billingService.deleteTenantCost(tenantId, body.action);
    } else {
      result = await this.billingService.upsertTenantCost(tenantId, body.action, body.cost);
    }

    await this.auditService.log({
      adminUserId: req.user.id,
      adminEmail: req.user.email,
      action: 'billing.costs.update',
      targetType: 'tenant',
      targetId: tenantId,
      targetLabel: null,
      metadata: { costAction: body.action, cost: body.cost },
    });

    return result;
  }

  @Get('config/tenant-costs/:tenantId/default-model')
  @UseGuards(SuperAdminGuard)
  getTenantDefaultModel(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.billingService.getTenantDefaultModel(tenantId);
  }

  @Post('config/tenant-costs/:tenantId/default-model')
  @UseGuards(SuperAdminGuard)
  async setTenantDefaultModel(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() body: { model: string },
    @Req() req: any,
  ) {
    const result = await this.billingService.setTenantDefaultModel(tenantId, body.model);

    await this.auditService.log({
      adminUserId: req.user.id,
      adminEmail: req.user.email,
      action: 'billing.model.update',
      targetType: 'tenant',
      targetId: tenantId,
      targetLabel: null,
      metadata: { model: body.model },
    });

    return result;
  }

  // ─── HISTORIAL GLOBAL ──────────────────────────────

  @Get('config/transactions')
  @UseGuards(SuperAdminGuard)
  getAllTransactions(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.billingService.getAllTransactions({
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  // ─── PLAN ──────────────────────────────────────────

  @Get(':tenantId/plan')
  @UseGuards(TenantAccessGuard)
  getPlan(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.billingService.getPlan(tenantId);
  }

  @Post(':tenantId/plan')
  @UseGuards(SuperAdminGuard)
  createPlan(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: CreatePlanDto,
  ) {
    return this.billingService.createPlan(tenantId, dto);
  }

  @Patch(':tenantId/plan')
  @UseGuards(SuperAdminGuard)
  updatePlan(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: Partial<CreatePlanDto>,
  ) {
    return this.billingService.updatePlan(tenantId, dto);
  }

  // ─── BALANCE ────────────────────────────────────────

  @Get(':tenantId/balance')
  @UseGuards(TenantAccessGuard)
  getBalance(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.billingService.getBalance(tenantId);
  }

  // ─── RECARGA ────────────────────────────────────────

  @Post(':tenantId/recharge')
  @UseGuards(SuperAdminGuard)
  recharge(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: RechargeDto,
    @Req() req: any,
  ) {
    return this.billingService.recharge(tenantId, dto, req.user.id);
  }

  // ─── HISTORIAL POR TENANT ──────────────────────────

  @Get(':tenantId/transactions')
  @UseGuards(TenantAccessGuard)
  getTransactions(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.billingService.getTransactions(tenantId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }
}
