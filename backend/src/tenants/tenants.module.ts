import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './tenant.entity';
import { ChannelConfig } from './channel-config.entity';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { ChannelConfigsService } from './channel-configs.service';
import { ChannelConfigsController } from './channel-configs.controller';
import { ConversionEvent } from '../conversions/conversion-event.entity';
import { InviteAgentController } from './invite-agent.controller';
import { AccountController } from './account.controller';
import { UserTenant } from '../users/user-tenant.entity';
import { User } from '../users/user.entity';
import { CustomField } from '../records/custom-field.entity';
import { BillingModule } from '../billing/billing.module';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, ChannelConfig, UserTenant, User, CustomField, ConversionEvent]),
    BillingModule,
    MailModule,
    AuthModule,
  ],
  controllers: [InviteAgentController, AccountController, TenantsController, ChannelConfigsController],
  providers: [TenantsService, ChannelConfigsService],
  exports: [TenantsService, ChannelConfigsService],
})
export class TenantsModule {}
