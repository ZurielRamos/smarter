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
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { MediaStorageService } from '../media/media-storage.service';
import { BillingService } from '../billing/billing.service';
import { CreatePlanDto, RechargeDto } from '../billing/dto';

@Controller('tenants')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly mediaStorage: MediaStorageService,
    private readonly billingService: BillingService,
  ) {}

  @Get()
  findAll() {
    return this.tenantsService.findAll();
  }

  @Get('stats')
  getStats() {
    return this.tenantsService.getStats();
  }

  @Get('check-slug/:slug')
  checkSlug(@Param('slug') slug: string) {
    return this.tenantsService.checkSlugAvailability(slug);
  }

  @Get(':id/members')
  getMembers(@Param('id') id: string) {
    return this.tenantsService.getMembers(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Post()
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
  remove(@Param('id') id: string) {
    return this.tenantsService.remove(id);
  }

  // ─── BILLING / CRÉDITOS ─────────────────────────────

  /** Resumen completo de billing del tenant (plan + balance) */
  @Get(':id/billing')
  async getBillingSummary(@Param('id') id: string) {
    const [plan, balance] = await Promise.all([
      this.billingService.getPlan(id),
      this.billingService.getBalance(id).catch(() => null),
    ]);
    return { plan, balance };
  }

  @Get(':id/billing/plan')
  getBillingPlan(@Param('id') id: string) {
    return this.billingService.getPlan(id);
  }

  @Post(':id/billing/plan')
  createBillingPlan(@Param('id') id: string, @Body() dto: CreatePlanDto) {
    return this.billingService.createPlan(id, dto);
  }

  @Patch(':id/billing/plan')
  updateBillingPlan(@Param('id') id: string, @Body() dto: Partial<CreatePlanDto>) {
    return this.billingService.updatePlan(id, dto);
  }

  @Get(':id/billing/balance')
  getBillingBalance(@Param('id') id: string) {
    return this.billingService.getBalance(id);
  }

  @Post(':id/billing/recharge')
  rechargeBilling(@Param('id') id: string, @Body() dto: RechargeDto, @Req() req: any) {
    return this.billingService.recharge(id, dto, req.user.id);
  }

  @Get(':id/billing/transactions')
  getBillingTransactions(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.billingService.getTransactions(id, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }
}
