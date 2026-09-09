import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync } from 'fs';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Body parsers robustos: algunos webhooks (p. ej. SendPulse) pueden llegar
  // con payloads grandes o con Content-Type poco estándar. Subimos el límite y
  // aceptamos JSON tanto para application/json como para text/plain y
  // application/*+json. NO capturamos multipart/urlencoded aquí para no romper
  // las subidas de archivos (Multer) ni los formularios existentes.
  app.use(
    express.json({
      limit: '10mb',
      type: ['application/json', 'application/*+json', 'text/plain'],
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Servir archivos subidos como estáticos
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  // Servir el frontend (build) desde la raíz
  // En desarrollo: ../frontend/dist (relativo al proyecto)
  // En producción (Docker): ../frontend/dist (relativo al workdir /app)
  const frontendPath = existsSync(join(__dirname, '..', 'frontend', 'dist'))
    ? join(__dirname, '..', 'frontend', 'dist')
    : join(__dirname, '..', '..', 'frontend', 'dist');
  if (existsSync(frontendPath)) {
    app.useStaticAssets(frontendPath);
  }

  app.setGlobalPrefix('api', {
    exclude: ['uploads/(.*)', 'webhooks/(.*)'],
  });

  // SPA fallback: rutas del frontend devuelven index.html
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use((req, res, next) => {
    // Solo el pathname, sin querystring, para no confundir un token
    // (p.ej. JWT que termina en ".xxxx") con una extensión de archivo.
    const pathname = req.url.split('?')[0];

    // Serve static landing page for root
    if (pathname === '/' || pathname === '/index') {
      const landingPath = join(process.cwd(), 'public', 'landing.html');
      if (existsSync(landingPath)) {
        return res.sendFile(landingPath);
      }
    }
    if (
      (pathname.startsWith('/api') && !pathname.startsWith('/api-reference')) ||
      pathname.startsWith('/uploads') ||
      pathname.startsWith('/webhooks') ||
      pathname.startsWith('/ws') ||
      pathname.startsWith('/socket.io') ||
      pathname.match(/\.\w+$/)
    ) {
      return next();
    }
    const indexPath = join(frontendPath, 'index.html');
    if (existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    next();
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Backend corriendo en http://localhost:${port}`);
}
bootstrap();
