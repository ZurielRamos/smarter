import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync } from 'fs';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin: ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3001', 'https://crm.strategee.us'],
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
    if (
      req.url.startsWith('/api') ||
      req.url.startsWith('/uploads') ||
      req.url.startsWith('/webhooks') ||
      req.url.match(/\.\w+$/)
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
