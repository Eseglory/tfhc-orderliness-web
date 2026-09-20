import { Module } from '@nestjs/common';
import { ServiceReminderService } from './service-reminder.service';
import { ChatModule } from '../chat/chat.module';
import { MailModule } from '../mail/mail.module';
import { PushModule } from '../push/push.module';

@Module({ imports: [ChatModule, MailModule, PushModule], providers: [ServiceReminderService], exports: [ServiceReminderService] })
export class ServiceReminderModule {}
