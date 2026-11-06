import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { LegalController } from './legal.controller';

@Module({
  imports: [MailModule],
  controllers: [LegalController],
})
export class LegalModule {}
