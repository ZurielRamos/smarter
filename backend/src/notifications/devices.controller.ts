import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PushService } from './push.service';

/** Registro de dispositivos móviles para push. Siempre opera sobre el usuario autenticado. */
@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(private readonly pushService: PushService) {}

  @Post()
  @HttpCode(204)
  async register(@Req() req: any, @Body() body: { token?: string; platform?: string }) {
    await this.pushService.registerDevice(req.user.id, body?.token ?? '', body?.platform ?? '');
  }

  @Post('unregister')
  @HttpCode(204)
  async unregister(@Req() req: any, @Body() body: { token?: string }) {
    if (body?.token) await this.pushService.unregisterDevice(req.user.id, body.token);
  }
}
