import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { getDatabaseConfig } from './config/database.config';
import { MediaModule } from './media/media.module';
import { UploadModule } from './upload/upload.module';
import { RecordsModule } from './records/records.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ChatsModule } from './chats/chats.module';
import { FormsModule } from './forms/forms.module';
import { EtlModule } from './etl/etl.module';
import { BillingModule } from './billing/billing.module';
import { ProvidersModule } from './providers/providers.module';
import { TeamsModule } from './teams/teams.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ConversionsModule } from './conversions/conversions.module';
import { TemplatesModule } from './templates/templates.module';
import { BotsModule } from './bots/bots.module';
import { AuditModule } from './audit/audit.module';
import { EvolutionModule } from './evolution/evolution.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,   // 1 segundo
        limit: 20,   // max 20 requests por segundo
      },
      {
        name: 'medium',
        ttl: 60000,  // 1 minuto
        limit: 100,  // max 100 requests por minuto
      },
      {
        name: 'long',
        ttl: 3600000, // 1 hora
        limit: 5000,  // max 5000 requests por hora
      },
    ]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          ...(configService.get<string>('REDIS_PASSWORD')
            ? { password: configService.get<string>('REDIS_PASSWORD') }
            : {}),
        },
      }),
    }),
    MediaModule,
    UploadModule,
    RecordsModule,
    CampaignsModule,
    TenantsModule,
    UsersModule,
    AuthModule,
    ChatsModule,
    FormsModule,
    EtlModule,
    BillingModule,
    ProvidersModule,
    TeamsModule,
    WebhooksModule,
    NotificationsModule,
    ConversionsModule,
    TemplatesModule,
    BotsModule,
    AuditModule,
    EvolutionModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
