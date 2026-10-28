import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/public.decorator';

/**
 * Branding configurable por entorno (white-label).
 *
 * Como el frontend se buildea DENTRO del Dockerfile (las variables VITE_* se
 * hornean en build time), el nombre y el logo NO se pueden cambiar en runtime
 * desde el `.env` del frontend. En cambio, el backend sí lee las variables de
 * entorno inyectadas al contenedor en runtime. Por eso el branding se expone
 * aquí y el frontend lo consume al arrancar: cambiar `APP_NAME`/`APP_LOGO_URL`
 * en el entorno del contenedor + reiniciar basta, sin reconstruir la imagen.
 *
 * Endpoint público (no requiere auth) porque se usa en pantallas previas al
 * login (Login, SetupPassword, landing, etc.).
 */
export interface BrandingConfig {
  /** Nombre visible de la aplicación (reemplaza "Smarter"). */
  name: string;
  /** Logo horizontal completo (header, login, etc.). URL absoluta o ruta relativa. */
  logoUrl: string | null;
  /** Variante del logo para fondos oscuros (opcional). */
  logoDarkUrl: string | null;
  /** Ícono/isotipo cuadrado (selector de tenant, builders, etc.). */
  iconUrl: string | null;
  /** Favicon de la pestaña del navegador. */
  faviconUrl: string | null;
  /** Título de la pestaña del navegador (document.title). */
  title: string;
}

@Controller('branding')
export class BrandingController {
  constructor(private readonly configService: ConfigService) {}

  @Public()
  @Get()
  getBranding(): BrandingConfig {
    const name = this.configService.get<string>('APP_NAME') || 'Smarter';
    const title =
      this.configService.get<string>('APP_TITLE') ||
      `${name} | Reach further, connect better`;

    return {
      name,
      title,
      // null => el frontend cae a sus assets por defecto (logo.svg, etc.)
      logoUrl: this.configService.get<string>('APP_LOGO_URL') || null,
      logoDarkUrl: this.configService.get<string>('APP_LOGO_DARK_URL') || null,
      iconUrl: this.configService.get<string>('APP_ICON_URL') || null,
      faviconUrl: this.configService.get<string>('APP_FAVICON_URL') || null,
    };
  }
}
