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
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { MediaStorageService } from '../media/media-storage.service';
import { BillingService } from '../billing/billing.service';
import { CreatePlanDto, RechargeDto } from '../billing/dto';
import { MailService } from '../mail/mail.service';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '@nestjs/config';
import { User } from '../users/user.entity';
import { UserTenant } from '../users/user-tenant.entity';
import { TenantRole } from '../users/enums/tenant-role.enum';
import { AuditService } from '../audit/audit.service';

@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly mediaStorage: MediaStorageService,
    private readonly billingService: BillingService,
    private readonly mailService: MailService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserTenant)
    private readonly userTenantRepo: Repository<UserTenant>,
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
    @Req() req: any,
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

    // Parse numeric/boolean fields from FormData (they arrive as strings)
    if (dto.maxAgents != null) dto.maxAgents = Number(dto.maxAgents);
    if ((dto as any).isDev === 'true') dto.isDev = true;
    else if ((dto as any).isDev === 'false') dto.isDev = false;
    if (dto.monthlyCredits != null) dto.monthlyCredits = Number(dto.monthlyCredits);
    if ((dto as any).rollover === 'true') dto.rollover = true;
    else if ((dto as any).rollover === 'false') dto.rollover = false;

    const tenant = await this.tenantsService.create(dto, iconUrl);

    // Create billing plan if provided
    if (dto.planType) {
      await this.billingService.createPlan(tenant.id, {
        type: dto.planType,
        monthlyCredits: dto.monthlyCredits || 0,
        rollover: dto.rollover ?? false,
      } as CreatePlanDto);
    }

    // Invite owner if email provided
    if (dto.ownerEmail) {
      await this.inviteOwner(tenant.id, tenant.name, dto.ownerEmail, dto.ownerName);
    }

    // Audit log
    await this.auditService.log({
      adminUserId: req.user.id,
      adminEmail: req.user.email,
      action: 'tenant.create',
      targetType: 'tenant',
      targetId: tenant.id,
      targetLabel: tenant.name,
      metadata: { slug: tenant.slug, maxAgents: tenant.maxAgents, isDev: tenant.isDev, ownerEmail: dto.ownerEmail || null },
    });

    return tenant;
  }

  /**
   * Invita al propietario (owner) de un tenant recién creado.
   * Si el usuario ya existe, le envía notificación de acceso.
   * Si no existe, lo crea con needsPasswordSetup y le envía invitación.
   */
  private async inviteOwner(
    tenantId: string,
    tenantName: string,
    email: string,
    name?: string,
  ): Promise<void> {
    const loginUrl = this.configService.get('FRONTEND_URL', 'http://localhost:5173') + '/login';

    let user = await this.userRepo.findOne({ where: { email } });

    if (user) {
      // User exists — assign as owner
      const existing = await this.userTenantRepo.findOne({
        where: { userId: user.id, tenantId },
      });
      if (!existing) {
        const ut = this.userTenantRepo.create({
          userId: user.id,
          tenantId,
          role: TenantRole.OWNER,
          status: 'pending',
        });
        await this.userTenantRepo.save(ut);
      }

      await this.mailService.sendTenantAccess({
        to: email,
        name: user.name,
        tenantName,
        role: TenantRole.OWNER,
        loginUrl,
      });
    } else {
      // New user — create and send invitation
      const ownerName = name || email.split('@')[0];
      const temporaryPassword = this.generatePassword();
      const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

      user = this.userRepo.create({
        name: ownerName,
        email,
        password: hashedPassword,
        isActive: true,
        isSuperAdmin: false,
        needsPasswordSetup: true,
      } as Partial<User>);
      user = await this.userRepo.save(user);

      const ut = this.userTenantRepo.create({
        userId: user.id,
        tenantId,
        role: TenantRole.OWNER,
        status: 'pending',
      });
      await this.userTenantRepo.save(ut);

      const setupToken = this.authService.generateSetupToken(user.id, email);
      const setupUrl = `${loginUrl.replace('/login', '/setup-password')}?token=${setupToken}`;

      await this.mailService.sendInvitation({
        to: email,
        name: ownerName,
        tenantName,
        role: TenantRole.OWNER,
        setupUrl,
      });
    }
  }

  private generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
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
    @Req() req: any,
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
    const updated = await this.tenantsService.update(id, dto, iconUrl);

    await this.auditService.log({
      adminUserId: req.user.id,
      adminEmail: req.user.email,
      action: 'tenant.update',
      targetType: 'tenant',
      targetId: id,
      targetLabel: updated.name,
      metadata: { changes: dto },
    });

    return updated;
  }

  @Patch(':id')
  @UseGuards(SuperAdminGuard)
  async patchUpdate(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @Req() req: any,
  ) {
    const updated = await this.tenantsService.update(id, dto);

    await this.auditService.log({
      adminUserId: req.user.id,
      adminEmail: req.user.email,
      action: 'tenant.update',
      targetType: 'tenant',
      targetId: id,
      targetLabel: updated.name,
      metadata: { changes: dto },
    });

    return updated;
  }

  @Delete(':id')
  @UseGuards(SuperAdminGuard)
  async remove(@Param('id') id: string, @Req() req: any) {
    const tenant = await this.tenantsService.findOne(id);

    await this.auditService.log({
      adminUserId: req.user.id,
      adminEmail: req.user.email,
      action: 'tenant.delete',
      targetType: 'tenant',
      targetId: id,
      targetLabel: tenant.name,
      metadata: { slug: tenant.slug },
    });

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
  async createBillingPlan(@Param('tenantId') tenantId: string, @Body() dto: CreatePlanDto, @Req() req: any) {
    const result = await this.billingService.createPlan(tenantId, dto);

    await this.auditService.log({
      adminUserId: req.user.id,
      adminEmail: req.user.email,
      action: 'billing.plan.create',
      targetType: 'tenant',
      targetId: tenantId,
      targetLabel: null,
      metadata: { ...dto },
    });

    return result;
  }

  @Patch(':tenantId/billing/plan')
  @UseGuards(SuperAdminGuard)
  async updateBillingPlan(@Param('tenantId') tenantId: string, @Body() dto: Partial<CreatePlanDto>, @Req() req: any) {
    const result = await this.billingService.updatePlan(tenantId, dto);

    await this.auditService.log({
      adminUserId: req.user.id,
      adminEmail: req.user.email,
      action: 'billing.plan.update',
      targetType: 'tenant',
      targetId: tenantId,
      targetLabel: null,
      metadata: { changes: dto },
    });

    return result;
  }

  @Get(':tenantId/billing/balance')
  @UseGuards(TenantAccessGuard)
  getBillingBalance(@Param('tenantId') tenantId: string) {
    return this.billingService.getBalance(tenantId);
  }

  @Post(':tenantId/billing/recharge')
  @UseGuards(SuperAdminGuard)
  async rechargeBilling(@Param('tenantId') tenantId: string, @Body() dto: RechargeDto, @Req() req: any) {
    const result = await this.billingService.recharge(tenantId, dto, req.user.id);

    await this.auditService.log({
      adminUserId: req.user.id,
      adminEmail: req.user.email,
      action: 'billing.recharge',
      targetType: 'tenant',
      targetId: tenantId,
      targetLabel: null,
      metadata: { amount: dto.amount },
    });

    return result;
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

  @Post('seed-fields')
  @UseGuards(SuperAdminGuard)
  seedMissingFields() {
    return this.tenantsService.seedMissingFieldsToAllTenants();
  }
}
