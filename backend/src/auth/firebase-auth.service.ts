import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

/** Claves públicas con las que Firebase Auth firma sus ID tokens (rotan; jose las cachea). */
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

/** Proveedores habilitados para iniciar sesión vía Firebase. */
const ALLOWED_PROVIDERS = new Set(['google.com', 'apple.com']);

type FirebaseClaims = JWTPayload & {
  email?: string;
  email_verified?: boolean;
  picture?: string;
  firebase?: { sign_in_provider?: string };
};

export type FirebaseIdentity = {
  email: string;
  provider: string;
  picture?: string;
};

/**
 * Verifica ID tokens de Firebase Authentication según la documentación de Firebase
 * ("Verify ID tokens using a third-party JWT library"): firma RS256 con las claves de
 * securetoken, `aud` = id del proyecto, `iss` = https://securetoken.google.com/<proyecto>,
 * `exp`/`iat` vigentes y `sub` no vacío. Solo necesita FIREBASE_PROJECT_ID (no requiere
 * cuenta de servicio).
 */
@Injectable()
export class FirebaseAuthService {
  private readonly logger = new Logger(FirebaseAuthService.name);
  /** Reemplazable en pruebas por un conjunto de claves local. */
  protected keySet: JWTVerifyGetKey = FIREBASE_JWKS;

  constructor(private readonly configService: ConfigService) {}

  async verify(idToken: string): Promise<FirebaseIdentity> {
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    if (!projectId) {
      throw new ServiceUnavailableException('El inicio de sesión con Google o Apple no está configurado');
    }
    if (!idToken || typeof idToken !== 'string') {
      throw new UnauthorizedException('Token inválido');
    }

    let claims: FirebaseClaims;
    try {
      const { payload } = await jwtVerify(idToken, this.keySet, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
        algorithms: ['RS256'],
        clockTolerance: 30,
      });
      claims = payload as FirebaseClaims;
    } catch (error) {
      this.logger.warn(`Token de Firebase rechazado: ${error instanceof Error ? error.message : error}`);
      throw new UnauthorizedException('No se pudo verificar tu sesión. Intenta de nuevo.');
    }

    if (!claims.sub) throw new UnauthorizedException('Token inválido');
    // `auth_time` no puede estar en el futuro (requisito de Firebase).
    const authTime = typeof claims.auth_time === 'number' ? claims.auth_time : 0;
    if (authTime > Math.floor(Date.now() / 1000) + 30) throw new UnauthorizedException('Token inválido');

    const provider = claims.firebase?.sign_in_provider ?? '';
    if (!ALLOWED_PROVIDERS.has(provider)) {
      throw new UnauthorizedException('Método de inicio de sesión no permitido');
    }
    if (!claims.email || claims.email_verified !== true) {
      throw new UnauthorizedException('Tu cuenta no tiene un correo verificado');
    }

    return { email: claims.email, provider, picture: claims.picture };
  }
}
