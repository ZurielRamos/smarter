import {
  Controller,
  Get,
  Put,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Tenant } from './tenant.entity';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantsService } from './tenants.service';
import { UserTenant } from '../users/user-tenant.entity';
import { User } from '../users/user.entity';
import { isAdminRole } from '../users/enums/tenant-role.enum';

/**
 * Endpoints para que owners/admins gestionen su propia cuenta (por slug).
 * Separados de /tenants que es exclusivo para superadmins.
 */
@Controller('account')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(
    private readonly tenantsService: TenantsService,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(UserTenant)
    private readonly userTenantRepo: Repository<UserTenant>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Resuelve el tenant por slug y verifica que el usuario sea admin/owner.
   * Retorna el tenant y el tenantId.
   */
  private async resolveAndAuthorize(slug: string, user: any): Promise<Tenant> {
    // SuperAdmin tiene acceso total
    if (user?.isSuperAdmin) {
      const tenant = await this.tenantRepo.findOne({ where: { slug } });
      if (!tenant) throw new NotFoundException('Cuenta no encontrada');
      return tenant;
    }

    const membership = user?.tenantRoles?.find(
      (tr: any) => tr.tenant?.slug === slug,
    );

    if (!membership || !isAdminRole(membership.role)) {
      throw new ForbiddenException('No tienes permisos de administrador en esta cuenta');
    }

    const tenant = await this.tenantRepo.findOne({ where: { slug } });
    if (!tenant) throw new NotFoundException('Cuenta no encontrada');
    return tenant;
  }

  /** Obtener datos del tenant por slug */
  @Get(':slug')
  async findBySlug(@Param('slug') slug: string, @Req() req: any) {
    const tenant = await this.resolveAndAuthorize(slug, req.user);
    return tenant;
  }

  /** Actualizar tenant por slug (PUT) */
  @Put(':slug')
  async update(@Param('slug') slug: string, @Body() dto: UpdateTenantDto, @Req() req: any) {
    const tenant = await this.resolveAndAuthorize(slug, req.user);
    return this.tenantsService.update(tenant.id, dto);
  }

  /** Actualizar tenant por slug (PATCH) */
  @Patch(':slug')
  async patchUpdate(@Param('slug') slug: string, @Body() dto: UpdateTenantDto, @Req() req: any) {
    const tenant = await this.resolveAndAuthorize(slug, req.user);
    return this.tenantsService.update(tenant.id, dto);
  }

  /** Obtener miembros del tenant por slug */
  @Get(':slug/members')
  async getMembers(@Param('slug') slug: string, @Req() req: any) {
    const tenant = await this.resolveAndAuthorize(slug, req.user);
    return this.tenantsService.getMembers(tenant.id);
  }

  /** Agregar usuario al tenant */
  @Post(':slug/members')
  async addMember(
    @Param('slug') slug: string,
    @Body() body: { userId: string; role: string },
    @Req() req: any,
  ) {
    const tenant = await this.resolveAndAuthorize(slug, req.user);
    const existing = await this.userTenantRepo.findOne({
      where: { userId: body.userId, tenantId: tenant.id },
    });
    if (existing) {
      existing.role = body.role as any;
      existing.status = 'active';
      return this.userTenantRepo.save(existing);
    }
    const ut = this.userTenantRepo.create({
      userId: body.userId,
      tenantId: tenant.id,
      role: body.role as any,
      status: 'active',
    });
    return this.userTenantRepo.save(ut);
  }

  /** Quitar usuario del tenant */
  @Delete(':slug/members/:userId')
  async removeMember(
    @Param('slug') slug: string,
    @Param('userId') userId: string,
    @Req() req: any,
  ) {
    const tenant = await this.resolveAndAuthorize(slug, req.user);
    const ut = await this.userTenantRepo.findOne({
      where: { userId, tenantId: tenant.id },
    });
    if (ut) {
      await this.userTenantRepo.remove(ut);
    }
    return { success: true };
  }

  /** Crear usuario y asignarlo al tenant */
  @Post(':slug/members/create')
  async createMember(
    @Param('slug') slug: string,
    @Body() body: { name: string; email: string; password: string; role: string },
    @Req() req: any,
  ) {
    const tenant = await this.resolveAndAuthorize(slug, req.user);

    // Check if user already exists
    let user = await this.userRepo.findOne({ where: { email: body.email } });
    if (!user) {
      const hashedPassword = await bcrypt.hash(body.password, 10);
      user = this.userRepo.create({
        name: body.name,
        email: body.email,
        password: hashedPassword,
        isActive: true,
        isSuperAdmin: false,
      } as Partial<User>);
      user = await this.userRepo.save(user);
    }

    // Assign to tenant
    const existing = await this.userTenantRepo.findOne({
      where: { userId: user.id, tenantId: tenant.id },
    });
    if (!existing) {
      const ut = this.userTenantRepo.create({
        userId: user.id,
        tenantId: tenant.id,
        role: body.role as any,
        status: 'active',
      });
      await this.userTenantRepo.save(ut);
    }

    return { id: user.id };
  }
}
