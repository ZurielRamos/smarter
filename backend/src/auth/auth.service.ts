import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async login(email: string, password: string) {
    const user = await this.userRepo.findOne({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        name: true,
        isSuperAdmin: true,
        isActive: true,
      },
      relations: {
        tenantRoles: { tenant: true },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Usuario desactivado');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      isSuperAdmin: user.isSuperAdmin,
    };

    const token = this.jwtService.sign(payload);

    // Determine redirect path
    let redirectTo = '/admin';
    const activeRoles = user.tenantRoles?.filter((tr) => tr.status === 'active') || [];
    const pendingInvites = user.tenantRoles?.filter((tr) => tr.status === 'pending') || [];

    if (!user.isSuperAdmin && activeRoles.length > 0) {
      const firstTenant = activeRoles[0].tenant;
      redirectTo = `/${firstTenant.slug}`;
    }

    return {
      access_token: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isSuperAdmin: user.isSuperAdmin,
        needsPasswordSetup: user.needsPasswordSetup,
        tenantRoles: activeRoles.map((tr) => ({
          tenantId: tr.tenantId,
          role: tr.role,
          tenant: {
            id: tr.tenant.id,
            name: tr.tenant.name,
            slug: tr.tenant.slug,
            iconPath: tr.tenant.iconPath,
          },
        })),
        pendingInvites: pendingInvites.map((tr) => ({
          tenantId: tr.tenantId,
          role: tr.role,
          tenant: {
            id: tr.tenant.id,
            name: tr.tenant.name,
            slug: tr.tenant.slug,
            iconPath: tr.tenant.iconPath,
          },
        })),
      },
      redirectTo,
    };
  }

  async validateToken(payload: any) {
    const user = await this.userRepo.findOne({
      where: { id: payload.sub },
      relations: {
        tenantRoles: { tenant: true },
      },
    });
    if (!user || !user.isActive) return null;

    const activeRoles = user.tenantRoles?.filter((tr) => tr.status === 'active') || [];
    const pendingInvites = user.tenantRoles?.filter((tr) => tr.status === 'pending') || [];

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      isSuperAdmin: user.isSuperAdmin,
      needsPasswordSetup: user.needsPasswordSetup,
      tenantRoles: activeRoles.map((tr) => ({
        tenantId: tr.tenantId,
        role: tr.role,
        tenant: {
          id: tr.tenant.id,
          name: tr.tenant.name,
          slug: tr.tenant.slug,
          iconPath: tr.tenant.iconPath,
        },
      })),
      pendingInvites: pendingInvites.map((tr) => ({
        tenantId: tr.tenantId,
        role: tr.role,
        tenant: {
          id: tr.tenant.id,
          name: tr.tenant.name,
          slug: tr.tenant.slug,
          iconPath: tr.tenant.iconPath,
        },
      })),
    };
  }
}
