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

  /** Completar registro: usuario nuevo configura su contraseña */
  @Post('setup-password')
  async setupPassword(@Body() body: { email: string; temporaryPassword: string; newPassword: string }) {
    const user = await this.userRepo.findOne({
      where: { email: body.email },
      select: { id: true, email: true, password: true, needsPasswordSetup: true },
    });
    if (!user) return { error: 'Usuario no encontrado' };
    if (!user.needsPasswordSetup) return { error: 'Este usuario ya configuró su contraseña' };

    // Verify temporary password
    const isValid = await bcrypt.compare(body.temporaryPassword, user.password);
    if (!isValid) return { error: 'Contraseña temporal incorrecta' };

    // Set new password and activate
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
