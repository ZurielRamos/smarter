import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { UserTenant } from './user-tenant.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignTenantDto } from './dto/assign-tenant.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserTenant)
    private readonly userTenantRepo: Repository<UserTenant>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userRepo.find({ order: { createdAt: 'DESC' } });
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
      return this.userTenantRepo.save(existing);
    }

    const ut = this.userTenantRepo.create({
      userId,
      tenantId: dto.tenantId,
      role: dto.role,
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
