import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/user.entity';
import { UserTenant } from '../users/user-tenant.entity';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserTenant)
    private readonly userTenantRepo: Repository<UserTenant>,
  ) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Req() req: any) {
    return req.user;
  }

  /** Rechazar invitación a un tenant */
  @UseGuards(JwtAuthGuard)
  @Post('decline-invite')
  async declineInvite(@Req() req: any, @Body() body: { tenantId: string }) {
    const userId = req.user.id;
    const ut = await this.userTenantRepo.findOne({
      where: { userId, tenantId: body.tenantId, status: 'pending' },
    });
    if (!ut) return { error: 'No se encontró invitación pendiente' };
    await this.userTenantRepo.remove(ut);
    return { status: 'declined', message: 'Invitación rechazada' };
  }

  /** Aceptar invitación a un tenant (usuario existente) */
  @UseGuards(JwtAuthGuard)
  @Post('accept-invite')
  async acceptInvite(@Req() req: any, @Body() body: { tenantId: string }) {
    const userId = req.user.id;
    const ut = await this.userTenantRepo.findOne({
      where: { userId, tenantId: body.tenantId, status: 'pending' },
    });
    if (!ut) return { error: 'No se encontró invitación pendiente' };
    ut.status = 'active';
    await this.userTenantRepo.save(ut);
    return { status: 'active', message: 'Invitación aceptada' };
  }

  /** Completar registro: usuario nuevo configura su contraseña via token */
  @Post('setup-password')
  async setupPassword(@Body() body: { token: string; newPassword: string }) {
    const payload = this.authService.verifySetupToken(body.token);
    if (!payload || payload.purpose !== 'password-setup') {
      return { error: 'Token inválido o expirado' };
    }

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) return { error: 'Usuario no encontrado' };

    user.password = await bcrypt.hash(body.newPassword, 10);
    (user as any).needsPasswordSetup = false;
    await this.userRepo.save(user);

    // Activate all pending tenant roles
    await this.userTenantRepo.update(
      { userId: user.id, status: 'pending' },
      { status: 'active' },
    );

    return { status: 'completed', message: 'Contraseña configurada correctamente' };
  }
}
