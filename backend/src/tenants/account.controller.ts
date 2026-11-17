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
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Tenant } from './tenant.entity';
import { TenantsService } from './tenants.service';
import { UserTenant } from '../users/user-tenant.entity';
import { User } from '../users/user.entity';
import { isAdminRole, TenantRole } from '../users/enums/tenant-role.enum';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Roles que un administrador puede asignar. «owner» no se asigna ni se quita desde aquí. */
const ASSIGNABLE_ROLES: string[] = [TenantRole.ADMIN, TenantRole.AGENT, TenantRole.VIEWER];

function requireAssignableRole(role: unknown): TenantRole {
  if (typeof role !== 'string' || !ASSIGNABLE_ROLES.includes(role)) {
    throw new BadRequestException(`Rol inválido. Roles permitidos: ${ASSIGNABLE_ROLES.join(', ')}`);
  }
  return role as TenantRole;
}

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
  async update(@Param('slug') slug: string, @Body() body: Record<string, unknown>, @Req() req: any) {
    const tenant = await this.resolveAndAuthorize(slug, req.user);
    // Lista blanca: el cuerpo nunca puede cambiar el id ni la configuración comercial de la cuenta.
    return this.tenantsService.updateOwnAccount(tenant.id, body ?? {});
  }

  /** Actualizar tenant por slug (PATCH) */
  @Patch(':slug')
  async patchUpdate(@Param('slug') slug: string, @Body() body: Record<string, unknown>, @Req() req: any) {
    const tenant = await this.resolveAndAuthorize(slug, req.user);
    return this.tenantsService.updateOwnAccount(tenant.id, body ?? {});
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
    const role = requireAssignableRole(body?.role);
    if (typeof body?.userId !== 'string' || !UUID_RE.test(body.userId)) throw new BadRequestException('Usuario inválido');
    const target = await this.userRepo.findOne({ where: { id: body.userId } });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    const existing = await this.userTenantRepo.findOne({
      where: { userId: body.userId, tenantId: tenant.id },
    });
    if (existing) {
      // El propietario no se modifica desde aquí (ni para degradarlo ni para reactivarlo con otro rol).
      if (existing.role === TenantRole.OWNER) throw new ForbiddenException('No se puede cambiar el rol del propietario de la cuenta');
      existing.role = role;
      existing.status = 'active';
      return this.userTenantRepo.save(existing);
    }
    const ut = this.userTenantRepo.create({
      userId: body.userId,
      tenantId: tenant.id,
      role,
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
      if (ut.role === TenantRole.OWNER) throw new ForbiddenException('No se puede quitar al propietario de la cuenta');
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
    const role = requireAssignableRole(body?.role);
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) throw new BadRequestException('Correo electrónico inválido');
    if (typeof body?.name !== 'string' || !body.name.trim() || body.name.length > 150) throw new BadRequestException('El nombre es obligatorio');

    // Check if user already exists
    let user = await this.userRepo.findOne({ where: { email } });
    if (!user) {
      if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) {
        throw new BadRequestException('La contraseña debe tener entre 8 y 128 caracteres');
      }
      const hashedPassword = await bcrypt.hash(body.password, 10);
      user = this.userRepo.create({
        name: body.name.trim(),
        email,
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
        role,
        status: 'active',
      });
      await this.userTenantRepo.save(ut);
    }

    return { id: user.id };
  }
}
