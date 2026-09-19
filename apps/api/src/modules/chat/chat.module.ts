import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResumableUploadsController } from './resumable-uploads.controller';
import { ResumableUploadsService } from './resumable-uploads.service';
import { ChatService } from './chat.service';
import { ChatAttachmentsService } from './chat-attachments.service';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { ChatBufferRepository } from './chat-buffer.repository';
import { ChatMigrationJob } from './chat-migration.job';

import { PushModule } from '../push/push.module';

/**
 * Real-time in-app chat: system rooms (General, Executives), custom rooms and
 * 1:1 direct messages, delivered over a Socket.IO gateway with high-speed
 * local SQLite buffering, WAL persistence, midnight migration, and REST fallbacks.
 */
@Module({
  imports: [AuthModule, PushModule],
  controllers: [ChatController, ResumableUploadsController],
  providers: [
    ChatBufferRepository,
    ChatMigrationJob,
    ChatService,
    ChatAttachmentsService,
    ChatGateway,
    ResumableUploadsService,
  ],
  exports: [ChatService, ChatGateway, ChatBufferRepository, ChatMigrationJob],
})
export class ChatModule {}
