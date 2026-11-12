import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Form } from './form.entity';
import { ClientRecord } from '../records/record.entity';
import { Conversation } from '../chats/conversation.entity';
import { Message } from '../chats/message.entity';
import { FormsService } from './forms.service';
import { FormsController } from './forms.controller';
import { ConversionsModule } from '../conversions/conversions.module';

@Module({
  imports: [TypeOrmModule.forFeature([Form, ClientRecord, Conversation, Message]), ConversionsModule],
  providers: [FormsService],
  controllers: [FormsController],
  exports: [FormsService],
})
export class FormsModule {}
