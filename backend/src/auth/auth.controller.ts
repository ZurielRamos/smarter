import { Controller, Post, Body, Get, Patch, UseGuards, Req, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/user.entity';
import { UserTenant } from '../users/user-tenant.entity';
import { MailService } from '../mail/mail.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
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

  /** Solicitar recuperación de contraseña */
  @Post('forgot-password')
  async forgotPassword(@Body() body: { email: string }) {
    const user = await this.userRepo.findOne({ where: { email: body.email } });
    if (!user) {
      // No revelar si el email existe o no
      return { status: 'sent', message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.' };
    }

    const token = this.authService.generateSetupToken(user.id, user.email);
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:5173');
    const resetUrl = `${frontendUrl}/setup-password?token=${token}&mode=reset`;

    await this.mailService.sendPasswordReset({
      to: user.email,
      name: user.name,
      resetUrl,
    });

    return { status: 'sent', message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.' };
  }

  /** Aceptar invitación a un tenant (usuario existente) */
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

  /** Actualizar perfil del usuario autenticado */
  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  @UseInterceptors(FileInterceptor('avatar'))
  async updateProfile(
    @Req() req: any,
    @Body() body: { name?: string; currentPassword?: string; newPassword?: string },
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    const user = await this.userRepo.findOne({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, password: true, avatarPath: true },
    });
    if (!user) return { error: 'Usuario no encontrado' };

    // Update name
    if (body.name && body.name.trim()) {
      user.name = body.name.trim();
    }

    // Update password
    if (body.newPassword) {
      if (!body.currentPassword) {
        return { error: 'Debes proporcionar la contraseña actual' };
      }
      const isValid = await bcrypt.compare(body.currentPassword, user.password);
      if (!isValid) {
        return { error: 'La contraseña actual es incorrecta' };
      }
      user.password = await bcrypt.hash(body.newPassword, 10);
    }

    // Update avatar
    if (avatar) {
      const uploadsDir = path.join(process.cwd(), 'uploads', 'avatars');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const ext = path.extname(avatar.originalname) || '.png';
      const filename = `${user.id}-${Date.now()}${ext}`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, avatar.buffer);

      // Remove old avatar if exists
      if (user.avatarPath) {
        const oldPath = path.join(process.cwd(), user.avatarPath);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      user.avatarPath = `uploads/avatars/${filename}`;
    }

    await this.userRepo.save(user);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarPath: user.avatarPath,
    };
  }

  /** Regenerar el token de API del usuario autenticado */
  @UseGuards(JwtAuthGuard)
  @Post('regenerate-api-token')
  async regenerateApiToken(@Req() req: any) {
    const { randomBytes } = await import('crypto');
    const user = await this.userRepo.findOne({ where: { id: req.user.id } });
    if (!user) return { error: 'Usuario no encontrado' };

    user.apiToken = randomBytes(32).toString('hex');
    await this.userRepo.save(user);

    return { apiToken: user.apiToken };
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
