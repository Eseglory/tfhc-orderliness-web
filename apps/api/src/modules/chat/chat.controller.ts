import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { ChatService } from './chat.service';
import { ChatAttachmentsService } from './chat-attachments.service';
import { ChatGateway } from './chat.gateway';
import { ChatViewer } from './chat.util';

function viewerFrom(user: AuthenticatedUser): ChatViewer {
  return {
    userId: user.userId,
    memberId: user.memberId,
    role: user.role,
    permissions: user.permissions ?? [],
    isSuperAdmin: user.isSuperAdmin,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly attachments: ChatAttachmentsService,
    private readonly gateway: ChatGateway,
  ) {}

  // ---- Rooms -------------------------------------------------------------

  @Get('rooms')
  listRooms(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.listRooms(viewerFrom(user));
  }

  @Get('unread')
  unread(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.unreadSummary(viewerFrom(user));
  }

  @Get('contacts')
  contacts(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.contacts(viewerFrom(user));
  }

  @Post('direct/:memberId')
  direct(@Param('memberId') memberId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.getOrCreateDirect(viewerFrom(user), memberId);
  }

  @Get('rooms/:id')
  getRoom(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.getRoom(id, viewerFrom(user));
  }

  @Get('rooms/:id/members')
  roomMembers(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.listRoomMembers(id, viewerFrom(user));
  }

  @Get('rooms/:id/messages')
  messages(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chat.listMessages(id, viewerFrom(user), { cursor, limit: limit ? Number(limit) : undefined });
  }

  @Post('rooms/:id/messages')
  async send(@Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    const viewer = viewerFrom(user);
    const message = await this.chat.postMessage(id, viewer, {
      body: body?.body,
      type: body?.type,
      attachmentUrl: body?.attachmentUrl,
      attachmentMeta: body?.attachmentMeta,
      replyToId: body?.replyToId,
    });
    await this.gateway.fanOut(id, message);
    return message;
  }

  @Post('rooms/:id/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 + 1, files: 1 } }))
  async attach(
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; size: number; mimetype?: string; originalname?: string },
    @Body() body: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const viewer = viewerFrom(user);
    const prepared = await this.attachments.prepare(file);
    const message = await this.chat.postMessage(id, viewer, {
      body: body?.body,
      type: prepared.type,
      attachmentUrl: prepared.attachmentUrl,
      attachmentMeta: prepared.attachmentMeta,
      replyToId: body?.replyToId,
    });
    await this.gateway.fanOut(id, message);
    return message;
  }

  @Post('rooms/:id/read')
  async markRead(@Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    const viewer = viewerFrom(user);
    const res = await this.chat.markRead(id, viewer, { messageId: body?.messageId });
    this.gateway.emitRoomEvent(id, 'message:read', {
      roomId: id,
      memberId: viewer.memberId,
      lastReadAt: res.lastReadAt,
    });
    return res;
  }

  @Post('rooms/:id/leave')
  leave(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.leaveRoom(viewerFrom(user), id);
  }

  // ---- Messages --------------------------------------------------------

  @Patch('messages/:id')
  async edit(@Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    const message = await this.chat.editMessage(id, viewerFrom(user), body?.body ?? '');
    this.gateway.emitRoomEvent(message.roomId, 'message:update', message);
    return message;
  }

  @Delete('messages/:id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const message = await this.chat.deleteMessage(id, viewerFrom(user));
    this.gateway.emitRoomEvent(message.roomId, 'message:update', message);
    return message;
  }

  // ---- Custom room management (RBAC) ----------------------------------

  @Post('rooms')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('messages.manage_rooms')
  createRoom(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.createRoom(viewerFrom(user), body);
  }

  @Patch('rooms/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('messages.manage_rooms')
  updateRoom(@Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.updateRoom(viewerFrom(user), id, body);
  }

  @Post('rooms/:id/members')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('messages.manage_rooms')
  addMembers(@Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.addMembers(viewerFrom(user), id, body?.memberIds ?? []);
  }

  @Delete('rooms/:id/members/:memberId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('messages.manage_rooms')
  removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chat.removeMember(viewerFrom(user), id, memberId);
  }
}
