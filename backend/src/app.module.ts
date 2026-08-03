import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
})
export class AppModule {}
