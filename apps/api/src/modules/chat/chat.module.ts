import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatService } from './chat.service';
import { ChatAttachmentsService } from './chat-attachments.service';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';

/**
 * Real-time in-app chat: system rooms (General, Executives), custom rooms and
 * 1:1 direct messages, delivered over a Socket.IO gateway with a REST fallback
 * for history and room management.
 */
@Module({
  imports: [AuthModule],
  controllers: [ChatController],
  providers: [ChatService, ChatAttachmentsService, ChatGateway],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}
