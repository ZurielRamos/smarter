import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DeviceToken } from './device-token.entity';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;
/** Expo acepta hasta 100 mensajes por petición. */
const BATCH_SIZE = 100;

export type PushPayload = {
  title: string;
  body?: string;
  /** Datos que la app usa para abrir la pantalla correcta. */
  data?: Record<string, unknown>;
};

type ExpoTicket = { status: 'ok' | 'error'; details?: { error?: string } };

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectRepository(DeviceToken)
    private readonly deviceRepo: Repository<DeviceToken>,
    private readonly configService: ConfigService,
  ) {}

  async registerDevice(userId: string, token: string, platform: string): Promise<void> {
    if (!TOKEN_RE.test(token)) throw new BadRequestException('Token de notificaciones inválido');
    if (platform !== 'ios' && platform !== 'android') {
      throw new BadRequestException('Plataforma inválida');
    }
    // Si el dispositivo cambió de usuario, el token pasa al nuevo (el anterior ya no debe recibir sus avisos).
    await this.deviceRepo.upsert({ userId, token, platform }, { conflictPaths: ['token'] });
  }

  /** Solo borra tokens del propio usuario. */
  async unregisterDevice(userId: string, token: string): Promise<void> {
    await this.deviceRepo.delete({ userId, token });
  }

  /** Envía a todos los dispositivos del usuario. Nunca lanza: una caída de Expo no debe afectar al flujo de mensajes. */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    try {
      const devices = await this.deviceRepo.find({ where: { userId } });
      if (devices.length === 0) return;

      const accessToken = this.configService.get<string>('EXPO_ACCESS_TOKEN');
      for (let i = 0; i < devices.length; i += BATCH_SIZE) {
        const batch = devices.slice(i, i + BATCH_SIZE);
        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify(
            batch.map((device) => ({
              to: device.token,
              title: payload.title,
              body: payload.body,
              data: payload.data,
              sound: 'default',
              priority: 'high',
              channelId: 'messages',
            })),
          ),
        });

        if (!response.ok) {
          this.logger.warn(`Expo push respondió ${response.status}`);
          continue;
        }

        const result = (await response.json()) as { data?: ExpoTicket[] };
        const invalid = batch
          .filter((_, index) => result.data?.[index]?.details?.error === 'DeviceNotRegistered')
          .map((device) => device.token);
        if (invalid.length > 0) await this.deviceRepo.delete({ token: In(invalid) });
      }
    } catch (error) {
      this.logger.warn(`No se pudo enviar push: ${error instanceof Error ? error.message : error}`);
    }
  }
}
