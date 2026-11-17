import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>(
        'JWT_SECRET',
        'stratecast-super-secret-key',
      ),
    });
  }

  async validate(payload: any) {
    // Los tokens con `purpose` (invitación, reseteo de contraseña, portales) se firman con
    // este mismo secreto pero NO son sesiones: no pueden autenticar la API.
    if (payload?.purpose) {
      throw new UnauthorizedException();
    }
    const user = await this.authService.validateToken(payload);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
