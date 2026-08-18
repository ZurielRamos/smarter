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

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // ─── COSTOS (rutas estáticas primero) ───────────────

  @Get('config/costs')
  @UseGuards(SuperAdminGuard)
  getAllCosts() {
    return this.billingService.getAllCosts();
  }

  @Post('config/costs')
  @UseGuards(SuperAdminGuard)
  upsertCost(@Body() body: { action: string; label: string; cost: number }) {
    return this.billingService.upsertCost(body.action, body.label, body.cost);
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
  upsertTenantCost(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() body: { action: string; cost: number | null },
  ) {
    if (body.cost === null || body.cost === 0) {
      return this.billingService.deleteTenantCost(tenantId, body.action);
    }
    return this.billingService.upsertTenantCost(tenantId, body.action, body.cost);
  }

  @Get('config/tenant-costs/:tenantId/default-model')
  @UseGuards(SuperAdminGuard)
  getTenantDefaultModel(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.billingService.getTenantDefaultModel(tenantId);
  }

  @Post('config/tenant-costs/:tenantId/default-model')
  @UseGuards(SuperAdminGuard)
  setTenantDefaultModel(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() body: { model: string },
  ) {
    return this.billingService.setTenantDefaultModel(tenantId, body.model);
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
