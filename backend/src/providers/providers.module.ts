import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelProvider } from './channel-provider.entity';
import { EmailDomainConfig } from './email-domain.entity';
import { ProvidersService } from './providers.service';
import { ProvidersController } from './providers.controller';
import { EmailDomainService } from './email-domain.service';
import { EmailDomainController } from './email-domain.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ChannelProvider, EmailDomainConfig])],
  controllers: [ProvidersController, EmailDomainController],
  providers: [ProvidersService, EmailDomainService],
  exports: [ProvidersService, EmailDomainService],
})
export class ProvidersModule {}
