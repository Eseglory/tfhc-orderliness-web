import { ChatModule } from '../chat/chat.module';
import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { PushModule } from '../push/push.module';

@Module({
  imports: [PushModule, ChatModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
