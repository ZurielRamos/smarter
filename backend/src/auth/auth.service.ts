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

  /** Generate a short-lived token for password setup/reset */
  generateSetupToken(userId: string, email: string): string {
    return this.jwtService.sign(
      { sub: userId, email, purpose: 'password-setup' },
      { expiresIn: '48h' },
    );
  }

  /** Verify a setup token */
  verifySetupToken(token: string): { sub: string; email: string; purpose: string } | null {
    try {
      return this.jwtService.verify(token) as { sub: string; email: string; purpose: string };
    } catch {
      return null;
    }
  }

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
    let redirectTo = '/';
    const activeRoles = user.tenantRoles?.filter((tr) => tr.status === 'active') || [];
    const pendingInvites = user.tenantRoles?.filter((tr) => tr.status === 'pending') || [];

    if (user.isSuperAdmin) {
      redirectTo = '/admin';
    } else if (activeRoles.length > 0) {
      redirectTo = `/${activeRoles[0].tenant.slug}`;
    } else if (pendingInvites.length > 0) {
      // Has pending invites but no active tenants — go to a waiting state
      redirectTo = '/pending';
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

    // Auto-generate API token for existing users that don't have one
    if (!user.apiToken) {
      const { randomBytes } = await import('crypto');
      user.apiToken = randomBytes(32).toString('hex');
      await this.userRepo.save(user);
    }

    const activeRoles = user.tenantRoles?.filter((tr) => tr.status === 'active') || [];
    const pendingInvites = user.tenantRoles?.filter((tr) => tr.status === 'pending') || [];

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      isSuperAdmin: user.isSuperAdmin,
      needsPasswordSetup: user.needsPasswordSetup,
      avatarPath: user.avatarPath ?? null,
      apiToken: user.apiToken ?? null,
      notificationPreferences: user.notificationPreferences ?? null,
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
