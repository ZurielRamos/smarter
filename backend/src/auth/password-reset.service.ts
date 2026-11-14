import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { User } from '../users/user.entity';
import { PasswordResetCode } from './password-reset-code.entity';

export const RESET_CODE_TTL_MINUTES = 15;
export const RESET_CODE_MAX_ATTEMPTS = 5;
/** Tiempo mínimo entre dos envíos de código al mismo usuario. */
export const RESET_CODE_RESEND_SECONDS = 60;
export const RESET_TOKEN_TTL = '10m';
export const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const TOKEN_PURPOSE = 'password-reset-code';

const INVALID_CODE = 'El código no es válido o expiró. Solicita uno nuevo.';

/**
 * Restablecer contraseña con código de verificación (app móvil):
 * 1. `request`: envía un código de 6 dígitos al correo. Responde igual exista o no la cuenta.
 * 2. `verify`: comprueba el código y entrega un token de un solo uso válido 10 minutos.
 * 3. `confirm`: con ese token, cambia la contraseña y consume el código.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(PasswordResetCode)
    private readonly codeRepo: Repository<PasswordResetCode>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  /** Cuenta activa con ese correo (sin distinguir mayúsculas), o null. */
  protected async findActiveUser(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;
    const user = await this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email: normalized })
      .getOne();
    return user && user.isActive ? user : null;
  }

  private hash(userId: string, code: string): string {
    const secret = this.configService.get<string>('JWT_SECRET', 'stratecast-super-secret-key');
    return createHmac('sha256', secret).update(`${userId}:${code}`).digest('hex');
  }

  private latestOpenCode(userId: string) {
    return this.codeRepo.findOne({
      where: { userId, consumedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async request(email: string): Promise<void> {
    const user = await this.findActiveUser(email ?? '');
    if (!user) return; // No revelar si el correo existe.

    const previous = await this.latestOpenCode(user.id);
    if (previous && Date.now() - previous.createdAt.getTime() < RESET_CODE_RESEND_SECONDS * 1000) {
      return; // Ya se envió uno hace menos de un minuto.
    }

    // Un solo código vigente por usuario: el anterior deja de servir.
    await this.codeRepo.update({ userId: user.id, consumedAt: IsNull() }, { consumedAt: new Date() });

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.codeRepo.save(
      this.codeRepo.create({
        userId: user.id,
        codeHash: this.hash(user.id, code),
        attempts: 0,
        expiresAt: new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000),
        consumedAt: null,
      }),
    );

    await this.mailService.sendPasswordResetCode({
      to: user.email,
      name: user.name,
      code,
      expiresInMinutes: RESET_CODE_TTL_MINUTES,
    });
  }

  async verify(email: string, code: string): Promise<{ resetToken: string }> {
    const digits = String(code ?? '').replace(/\D/g, '');
    if (digits.length !== 6) throw new BadRequestException('El código debe tener 6 dígitos');

    const user = await this.findActiveUser(email ?? '');
    const record = user ? await this.latestOpenCode(user.id) : null;
    if (!user || !record || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(INVALID_CODE);
    }
    if (record.attempts >= RESET_CODE_MAX_ATTEMPTS) {
      throw new BadRequestException('Superaste el número de intentos. Solicita un código nuevo.');
    }

    const expected = Buffer.from(record.codeHash, 'hex');
    const actual = Buffer.from(this.hash(user.id, digits), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      record.attempts += 1;
      await this.codeRepo.save(record);
      const left = RESET_CODE_MAX_ATTEMPTS - record.attempts;
      throw new BadRequestException(
        left > 0
          ? `Código incorrecto. Te ${left === 1 ? 'queda 1 intento' : `quedan ${left} intentos`}.`
          : 'Superaste el número de intentos. Solicita un código nuevo.',
      );
    }

    const resetToken = this.jwtService.sign(
      { sub: user.id, purpose: TOKEN_PURPOSE, jti: record.id },
      { expiresIn: RESET_TOKEN_TTL },
    );
    return { resetToken };
  }

  async confirm(resetToken: string, newPassword: string): Promise<void> {
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      throw new BadRequestException('La contraseña es demasiado larga');
    }

    let payload: { sub?: string; purpose?: string; jti?: string };
    try {
      payload = this.jwtService.verify(resetToken ?? '');
    } catch {
      throw new BadRequestException('La verificación expiró. Vuelve a solicitar un código.');
    }
    if (payload.purpose !== TOKEN_PURPOSE || !payload.sub || !payload.jti) {
      throw new BadRequestException('La verificación no es válida. Vuelve a solicitar un código.');
    }

    // El código debe seguir abierto: el token solo sirve una vez y no tras pedir otro código.
    const record = await this.codeRepo.findOne({
      where: { id: payload.jti, userId: payload.sub, consumedAt: IsNull() },
    });
    if (!record) {
      throw new BadRequestException('Esta verificación ya se usó. Vuelve a solicitar un código.');
    }

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new BadRequestException('La cuenta no está disponible');

    record.consumedAt = new Date();
    await this.codeRepo.save(record);

    user.password = await bcrypt.hash(newPassword, 10);
    user.needsPasswordSetup = false;
    await this.userRepo.save(user);
    this.logger.log(`Contraseña restablecida con código para el usuario ${user.id}`);
  }
}
