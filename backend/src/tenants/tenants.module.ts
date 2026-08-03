import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './tenant.entity';
import { ChannelConfig } from './channel-config.entity';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { ChannelConfigsService } from './channel-configs.service';
import { ChannelConfigsController } from './channel-configs.controller';
import { UserTenant } from '../users/user-tenant.entity';
import { CustomField } from '../records/custom-field.entity';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, ChannelConfig, UserTenant, CustomField]),
    BillingModule,
  ],
  controllers: [TenantsController, ChannelConfigsController],
  providers: [TenantsService, ChannelConfigsService],
  exports: [TenantsService, ChannelConfigsService],
})
export class TenantsModule {}
