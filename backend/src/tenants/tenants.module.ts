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

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, ChannelConfig, UserTenant, CustomField])],
  controllers: [TenantsController, ChannelConfigsController],
  providers: [TenantsService, ChannelConfigsService],
  exports: [TenantsService, ChannelConfigsService],
})
export class TenantsModule {}
