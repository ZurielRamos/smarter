import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { MediaStorageService } from '../media/media-storage.service';
import { BillingService } from '../billing/billing.service';
import { CreatePlanDto, RechargeDto } from '../billing/dto';

@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly mediaStorage: MediaStorageService,
    private readonly billingService: BillingService,
  ) {}

  @Get()
  @UseGuards(SuperAdminGuard)
  findAll() {
    return this.tenantsService.findAll();
  }

  @Get('stats')
  @UseGuards(SuperAdminGuard)
  getStats() {
    return this.tenantsService.getStats();
  }

  @Get('check-slug/:slug')
  @UseGuards(SuperAdminGuard)
  checkSlug(@Param('slug') slug: string) {
    return this.tenantsService.checkSlugAvailability(slug);
  }

  @Get(':id/members')
  @UseGuards(SuperAdminGuard)
  getMembers(@Param('id') id: string) {
    return this.tenantsService.getMembers(id);
  }

  @Get(':id')
  @UseGuards(SuperAdminGuard)
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Post()
  @UseGuards(SuperAdminGuard)
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'icon', maxCount: 1 }]),
  )
  async create(
    @Body() dto: CreateTenantDto,
    @UploadedFiles()
    files: { icon?: Express.Multer.File[] },
  ) {
    let iconUrl: string | null = null;
    if (files?.icon?.[0]) {
      const file = files.icon[0];
      const stored = await this.mediaStorage.uploadBuffer(
        file.buffer,
        {
          channel: 'system',
          tenantId: 'global',
          conversationId: 'tenants',
          messageId: dto.slug || Date.now().toString(),
          mimeType: file.mimetype,
          filename: file.originalname,
        },
      );
      iconUrl = stored?.url || null;
    }
    return this.tenantsService.create(dto, iconUrl);
  }

  @Put(':id')
  @UseGuards(SuperAdminGuard)
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'icon', maxCount: 1 }]),
  )
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @UploadedFiles()
    files: { icon?: Express.Multer.File[] },
  ) {
    let iconUrl: string | undefined;
    if (files?.icon?.[0]) {
      const file = files.icon[0];
      const stored = await this.mediaStorage.uploadBuffer(
        file.buffer,
        {
          channel: 'system',
          tenantId: id,
          conversationId: 'tenants',
          messageId: Date.now().toString(),
          mimeType: file.mimetype,
          filename: file.originalname,
        },
      );
      iconUrl = stored?.url || undefined;
    }
    return this.tenantsService.update(id, dto, iconUrl);
  }

  @Delete(':id')
  @UseGuards(SuperAdminGuard)
  remove(@Param('id') id: string) {
    return this.tenantsService.remove(id);
  }

  // ─── BILLING / CRÉDITOS ─────────────────────────────

  /** Resumen completo de billing del tenant (plan + balance) */
  @Get(':tenantId/billing')
  @UseGuards(TenantAccessGuard)
  async getBillingSummary(@Param('tenantId') tenantId: string) {
    const [plan, balance] = await Promise.all([
      this.billingService.getPlan(tenantId),
      this.billingService.getBalance(tenantId).catch(() => null),
    ]);
    return { plan, balance };
  }

  @Get(':tenantId/billing/plan')
  @UseGuards(TenantAccessGuard)
  getBillingPlan(@Param('tenantId') tenantId: string) {
    return this.billingService.getPlan(tenantId);
  }

  @Post(':tenantId/billing/plan')
  @UseGuards(SuperAdminGuard)
  createBillingPlan(@Param('tenantId') tenantId: string, @Body() dto: CreatePlanDto) {
    return this.billingService.createPlan(tenantId, dto);
  }

  @Patch(':tenantId/billing/plan')
  @UseGuards(SuperAdminGuard)
  updateBillingPlan(@Param('tenantId') tenantId: string, @Body() dto: Partial<CreatePlanDto>) {
    return this.billingService.updatePlan(tenantId, dto);
  }

  @Get(':tenantId/billing/balance')
  @UseGuards(TenantAccessGuard)
  getBillingBalance(@Param('tenantId') tenantId: string) {
    return this.billingService.getBalance(tenantId);
  }

  @Post(':tenantId/billing/recharge')
  @UseGuards(SuperAdminGuard)
  rechargeBilling(@Param('tenantId') tenantId: string, @Body() dto: RechargeDto, @Req() req: any) {
    return this.billingService.recharge(tenantId, dto, req.user.id);
  }

  @Get(':tenantId/billing/transactions')
  @UseGuards(TenantAccessGuard)
  getBillingTransactions(
    @Param('tenantId') tenantId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.billingService.getTransactions(tenantId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }
}
