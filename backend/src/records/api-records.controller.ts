import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { RecordsService } from './records.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';

/**
 * API pública de contactos.
 * Rutas: /api/v1/:slug/records
 * Autenticación: API Token (header x-api-token)
 * El slug identifica la cuenta (tenant).
 */
@Controller('v1/:slug/records')
@UseGuards(ApiTokenGuard)
export class ApiRecordsController {
  constructor(
    private readonly recordsService: RecordsService,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  /**
   * Resuelve el slug a un tenantId y verifica que el usuario tiene acceso.
   * Retorna { tenantId, role }.
   */
  private async resolveTenant(user: any, slug: string): Promise<{ tenantId: string; role: string }> {
    // SuperAdmin puede acceder a cualquier tenant
    if (user.isSuperAdmin) {
      const tenant = await this.tenantRepo.findOne({ where: { slug } });
      if (!tenant) throw new NotFoundException('Cuenta no encontrada');
      return { tenantId: tenant.id, role: 'admin' };
    }

    // Buscar en los roles activos del usuario
    const tenantRole = user.tenantRoles?.find((tr: any) => tr.tenant.slug === slug);
    if (!tenantRole) {
      throw new ForbiddenException('No tienes acceso a esta cuenta');
    }

    return { tenantId: tenantRole.tenantId, role: tenantRole.role };
  }

  /**
   * Verifica que el usuario tenga rol de admin. Los agentes solo tienen acceso de lectura.
   */
  private requireAdmin(role: string): void {
    if (role !== 'admin') {
      throw new ForbiddenException('Los agentes solo tienen acceso de lectura. Necesitas permisos de administrador para esta acción.');
    }
  }

  /**
   * GET /api/v1/:slug/records
   * Listar contactos con paginación.
   */
  @Get()
  async findAll(
    @Req() req: any,
    @Param('slug') slug: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
  ) {
    const { tenantId } = await this.resolveTenant(req.user, slug);
    return this.recordsService.findAll(+page, +limit, tenantId, sortBy, sortOrder);
  }

  /**
   * GET /api/v1/:slug/records/:id
   * Obtener un contacto por ID.
   */
  @Get(':id')
  async findOne(@Req() req: any, @Param('slug') slug: string, @Param('id') id: string) {
    const { tenantId } = await this.resolveTenant(req.user, slug);

    const record = await this.recordsService.findOneById(id);
    if (!record) {
      throw new NotFoundException('Contacto no encontrado');
    }
    if (record.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes acceso a este contacto');
    }

    return record;
  }

  /**
   * POST /api/v1/:slug/records
   * Crear un nuevo contacto.
   */
  @Post()
  async create(
    @Req() req: any,
    @Param('slug') slug: string,
    @Body() body: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      email?: string;
      documentType?: string;
      documentNumber?: string;
      gender?: string;
      birthDate?: string;
      city?: string;
      region?: string;
      status?: string;
      channelSource?: string;
      source?: string;
      score?: number;
      optInWhatsapp?: boolean;
      optInEmail?: boolean;
      tags?: string[];
      customData?: Record<string, any>;
    },
  ) {
    const { tenantId, role } = await this.resolveTenant(req.user, slug);
    this.requireAdmin(role);
    return this.recordsService.createRecord({
      tenantId,
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      email: body.email,
      status: body.status,
      channelSource: body.channelSource || 'api',
      tags: body.tags,
      customData: body.customData,
    });
  }

  /**
   * PUT /api/v1/:slug/records/:id
   * Actualizar un contacto existente.
   */
  @Put(':id')
  async update(
    @Req() req: any,
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() body: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      countryCode?: string;
      email?: string;
      documentType?: string;
      documentNumber?: string;
      gender?: string;
      birthDate?: string;
      city?: string;
      region?: string;
      status?: string;
      channelSource?: string;
      source?: string;
      score?: number;
      optInWhatsapp?: boolean;
      optInEmail?: boolean;
      assignedTo?: string;
      tags?: string[];
      customData?: Record<string, any>;
    },
  ) {
    const { tenantId, role } = await this.resolveTenant(req.user, slug);
    this.requireAdmin(role);

    const existing = await this.recordsService.findOneById(id);
    if (!existing) {
      throw new NotFoundException('Contacto no encontrado');
    }
    if (existing.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes acceso a este contacto');
    }

    const data: any = { ...body };
    if (data.birthDate) data.birthDate = new Date(data.birthDate);

    return this.recordsService.updateRecord(id, data);
  }

  /**
   * DELETE /api/v1/:slug/records/:id
   * Eliminar un contacto.
   */
  @Delete(':id')
  async remove(@Req() req: any, @Param('slug') slug: string, @Param('id') id: string) {
    const { tenantId, role } = await this.resolveTenant(req.user, slug);
    this.requireAdmin(role);

    const existing = await this.recordsService.findOneById(id);
    if (!existing) {
      throw new NotFoundException('Contacto no encontrado');
    }
    if (existing.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes acceso a este contacto');
    }

    await this.recordsService.deleteRecord(id);
    return { message: 'Contacto eliminado correctamente' };
  }
}
