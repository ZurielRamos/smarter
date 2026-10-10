import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { UserTenant } from './user-tenant.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignTenantDto } from './dto/assign-tenant.dto';
import { SyncTenantsDto } from './dto/sync-tenants.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserTenant)
    private readonly userTenantRepo: Repository<UserTenant>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<User[]> {
    // Excluir membresías "removed": la relación tenantRoles es eager, por lo que
    // un find() normal traería también las desvinculadas. Usamos QueryBuilder con
    // un LEFT JOIN condicionado para que los usuarios sin cuentas sigan apareciendo.
    return this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect(
        'user.tenantRoles',
        'tenantRole',
        'tenantRole.status != :removed',
        { removed: 'removed' },
      )
      .leftJoinAndSelect('tenantRole.tenant', 'tenant')
      .orderBy('user.createdAt', 'DESC')
      .getMany();
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException(`Email "${dto.email}" already exists`);

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = this.userRepo.create({
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
      isSuperAdmin: dto.isSuperAdmin ?? false,
    } as Partial<User>);

    const savedUser = await this.userRepo.save(user);

    // Assign tenant roles if provided
    if (dto.tenantRoles?.length) {
      for (const tr of dto.tenantRoles) {
        const ut = this.userTenantRepo.create({
          userId: savedUser.id,
          tenantId: tr.tenantId,
          role: tr.role,
        });
        await this.userTenantRepo.save(ut);
      }
    }

    return this.findOne(savedUser.id);
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 10);
    }

    Object.assign(user, dto);
    await this.userRepo.save(user);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.userRepo.remove(user);
  }

  // === Tenant role management ===

  async assignTenant(userId: string, dto: AssignTenantDto): Promise<UserTenant> {
    await this.findOne(userId); // validate user exists

    const existing = await this.userTenantRepo.findOne({
      where: { userId, tenantId: dto.tenantId },
    });

    if (existing) {
      existing.role = dto.role;
      // Reactivar la membresía: si la fila venía de un "removed" (borrado lógico),
      // asignar de nuevo debe volver a ponerla en 'active'. De lo contrario el
      // usuario quedaría sin acceso pese a aparecer asignado.
      existing.status = 'active';
      return this.userTenantRepo.save(existing);
    }

    const ut = this.userTenantRepo.create({
      userId,
      tenantId: dto.tenantId,
      role: dto.role,
      status: 'active',
    });
    return this.userTenantRepo.save(ut);
  }

  async removeTenantRole(userId: string, tenantId: string): Promise<void> {
    const ut = await this.userTenantRepo.findOne({
      where: { userId, tenantId },
    });
    if (!ut) throw new NotFoundException('Tenant role not found');
    ut.status = 'removed';
    await this.userTenantRepo.save(ut);
  }

  /**
   * Reconcilia el conjunto completo de cuentas de un usuario en una sola
   * transacción atómica. `dto.roles` representa el estado final deseado:
   *   - las membresías presentes se crean o reactivan (status = 'active') con su rol;
   *   - las membresías existentes que ya no estén en la lista se marcan 'removed'.
   * Al ejecutarse en una transacción, nunca queda un estado intermedio donde el
   * usuario pierda todas sus cuentas si algo falla a mitad de camino.
   */
  async syncTenants(userId: string, dto: SyncTenantsDto): Promise<UserTenant[]> {
    await this.findOne(userId); // validar que el usuario existe

    // Deduplicar por tenantId (si llegan repetidos, gana el último) y validar.
    const desiredByTenant = new Map<string, string>();
    for (const r of dto.roles ?? []) {
      if (!r.tenantId) continue;
      desiredByTenant.set(r.tenantId, r.role);
    }

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(UserTenant);
      const existingRows = await repo.find({ where: { userId } });
      const existingByTenant = new Map(existingRows.map((row) => [row.tenantId, row]));

      // 1. Crear o reactivar las cuentas deseadas.
      for (const [tenantId, role] of desiredByTenant) {
        const existing = existingByTenant.get(tenantId);
        if (existing) {
          existing.role = role as UserTenant['role'];
          existing.status = 'active';
          await repo.save(existing);
        } else {
          await repo.save(
            repo.create({
              userId,
              tenantId,
              role: role as UserTenant['role'],
              status: 'active',
            }),
          );
        }
      }

      // 2. Desvincular (soft-delete) las cuentas que ya no están en la lista.
      for (const existing of existingRows) {
        if (!desiredByTenant.has(existing.tenantId) && existing.status !== 'removed') {
          existing.status = 'removed';
          await repo.save(existing);
        }
      }

      // Devolver el estado final activo con el tenant cargado.
      return repo.find({
        where: { userId, status: 'active' },
        relations: { tenant: true },
      });
    });
  }

  async getUserTenants(userId: string): Promise<UserTenant[]> {
    return this.userTenantRepo.find({
      where: { userId },
      relations: { tenant: true },
    });
  }

  async getUsersByTenant(tenantId: string): Promise<UserTenant[]> {
    return this.userTenantRepo.find({
      where: { tenantId },
      relations: { user: true },
    });
  }

  async checkEmailAvailability(email: string): Promise<{ available: boolean }> {
    const existing = await this.userRepo.findOne({ where: { email } });
    return { available: !existing };
  }

  async findByEmail(email: string): Promise<{ exists: boolean; user?: { id: string; name: string; email: string } }> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) return { exists: false };
    return { exists: true, user: { id: user.id, name: user.name, email: user.email } };
  }

  async getStats() {
    const total = await this.userRepo.count();
    const superAdmins = await this.userRepo.count({ where: { isSuperAdmin: true } });
    const active = await this.userRepo.count({ where: { isActive: true } });
    return { total, superAdmins, active, inactive: total - active };
  }
}
