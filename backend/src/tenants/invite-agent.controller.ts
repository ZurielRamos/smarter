import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { User } from '../users/user.entity';
import { UserTenant } from '../users/user-tenant.entity';
import { Tenant } from './tenant.entity';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';

@Controller('tenants')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
export class InviteAgentController {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserTenant)
    private readonly userTenantRepo: Repository<UserTenant>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  @Post(':tenantId/invite')
  async inviteAgent(
    @Param('tenantId') tenantId: string,
    @Body() body: { name: string; email: string; role: string },
  ) {
    const { name, email, role } = body;

    if (!name || !email || !role) {
      throw new BadRequestException('name, email y role son requeridos');
    }

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new BadRequestException('Tenant no encontrado');

    // Check max agents limit
    const currentCount = await this.userTenantRepo.count({ where: { tenantId } });
    if (currentCount >= tenant.maxAgents) {
      throw new BadRequestException(`Se alcanzó el límite de ${tenant.maxAgents} agentes para esta cuenta`);
    }

    const loginUrl = this.configService.get('FRONTEND_URL', 'http://localhost:5173') + '/login';

    // Check if user already exists
    let user = await this.userRepo.findOne({ where: { email } });

    if (user) {
      // User exists — check if already in tenant
      const existingRole = await this.userTenantRepo.findOne({
        where: { userId: user.id, tenantId },
      });
      if (existingRole) {
        throw new BadRequestException('Este usuario ya pertenece a la cuenta');
      }

      // Assign to tenant
      const ut = this.userTenantRepo.create({ userId: user.id, tenantId, role });
      await this.userTenantRepo.save(ut);

      // Send access notification
      await this.mailService.sendTenantAccess({
        to: email,
        name: user.name,
        tenantName: tenant.name,
        role,
        loginUrl,
      });

      return { status: 'assigned', message: 'Usuario existente asignado a la cuenta' };
    }

    // User doesn't exist — create with temporary password
    const temporaryPassword = this.generatePassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    user = this.userRepo.create({
      name,
      email,
      password: hashedPassword,
      isActive: true,
      isSuperAdmin: false,
    } as Partial<User>);
    user = await this.userRepo.save(user);

    // Assign to tenant
    const ut = this.userTenantRepo.create({ userId: user.id, tenantId, role });
    await this.userTenantRepo.save(ut);

    // Send invitation email
    await this.mailService.sendInvitation({
      to: email,
      name,
      tenantName: tenant.name,
      role,
      temporaryPassword,
      loginUrl,
    });

    return { status: 'invited', message: 'Usuario creado e invitación enviada' };
  }

  private generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
