import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelProvider } from './channel-provider.entity';
import { EmailDomainConfig } from './email-domain.entity';
import { EmailUnsubscribe } from './email-unsubscribe.entity';
import { ProvidersService } from './providers.service';
import { ProvidersController } from './providers.controller';
import { EmailDomainService } from './email-domain.service';
import { EmailDomainController } from './email-domain.controller';
import { EmailUnsubscribeService } from './email-unsubscribe.service';
import { EmailUnsubscribeController } from './email-unsubscribe.controller';
import { MailgunService } from './mailgun.service';

@Module({
  imports: [TypeOrmModule.forFeature([ChannelProvider, EmailDomainConfig, EmailUnsubscribe])],
  controllers: [ProvidersController, EmailDomainController, EmailUnsubscribeController],
  providers: [ProvidersService, EmailDomainService, EmailUnsubscribeService, MailgunService],
  exports: [ProvidersService, EmailDomainService, EmailUnsubscribeService, MailgunService],
})
export class ProvidersModule {}
