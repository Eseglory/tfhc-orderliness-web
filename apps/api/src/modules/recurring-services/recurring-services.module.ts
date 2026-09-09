import { RecurringServicesController } from './recurring-services.controller';
import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { RecurringServicesService } from './recurring-services.service';
@Module({ controllers: [RecurringServicesController], imports: [MailModule], providers: [RecurringServicesService], exports: [RecurringServicesService] })
export class RecurringServicesModule {}
