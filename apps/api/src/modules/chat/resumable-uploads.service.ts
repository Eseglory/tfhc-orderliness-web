import { BadRequestException, ConflictException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatService } from './chat.service';
import { ChatAttachmentsService } from './chat-attachments.service';
import { ChatGateway } from './chat.gateway';
import { ChatViewer } from './chat.util';
export const CHUNK_SIZE = 256 * 1024;
@Injectable()
export class ResumableUploadsService {
  constructor(private prisma: PrismaService, private chat: ChatService, private attachments: ChatAttachmentsService, private gateway: ChatGateway) {}
  async begin(viewer: ChatViewer, input: { uploadId?: string; roomId?: string; name?: string; mime?: string; size?: number; sha256?: string; replyToId?: string }) {
    if (!Number.isInteger(input?.size) || input.size < 1 || input.size > 2 * 1024 * 1024) throw new PayloadTooLargeException('Files must be between 1 byte and 2 MB');
    if (typeof input.roomId !== 'string' || typeof input.name !== 'string' || !input.name || input.name.length > 200 ||
        typeof input.mime !== 'string' || input.mime.length > 150 || !/^[a-f0-9]{64}$/.test(input.sha256 || '')) throw new BadRequestException('Invalid upload metadata');
    if (!/^[a-f0-9-]{36}$/.test(input.uploadId || '')) throw new BadRequestException('Upload ID required');
    await this.chat.getRoom(input.roomId, viewer);
    const key = { userId: viewer.userId, roomId: input.roomId, sha256: input.sha256 };
    const existing = await this.prisma.resumableUpload.findUnique({ where: { id: input.uploadId } });
    if (existing && (existing.userId !== viewer.userId || existing.roomId !== input.roomId || existing.sha256 !== input.sha256 || existing.size !== input.size)) throw new ConflictException('Upload metadata changed');
    if (existing && existing.expiresAt > new Date()) return this.summary(existing);
    if (existing) await this.prisma.resumableUpload.deleteMany({ where: { id: existing.id, expiresAt: { lte: new Date() } } });
    if (await this.prisma.resumableUpload.count({ where: { userId: viewer.userId, expiresAt: { gt: new Date() }, messageId: null } }) >= 3) throw new BadRequestException('Finish or cancel an upload before starting another');
    try {
      const row = await this.prisma.resumableUpload.create({ data: { id: input.uploadId, ...key, name: input.name.replace(/[\\/\r\n]/g, '_'), mime: input.mime,
        size: input.size, data: Buffer.alloc(0), replyToId: input.replyToId || null, expiresAt: new Date(Date.now() + 86400000) } });
      return this.summary(row);
    } catch (error) {
      if (error?.code === 'P2002') throw new ConflictException('Upload was started in another tab. Retry to resume it.');
      throw error;
    }
  }
  private summary(row: { id: string; offset: number; size: number; messageId: string | null }) { return { uploadId: row.id, offset: row.offset, size: row.size, messageId: row.messageId, chunkSize: CHUNK_SIZE }; }
  private async owned(id: string, viewer: ChatViewer) {
    const row = await this.prisma.resumableUpload.findFirst({ where: { id, userId: viewer.userId, expiresAt: { gt: new Date() } } });
    if (!row) throw new NotFoundException('Upload expired or not found');
    await this.chat.getRoom(row.roomId, viewer);
    return row;
  }
  async status(id: string, viewer: ChatViewer) { return this.summary(await this.owned(id, viewer)); }
  async chunk(id: string, viewer: ChatViewer, offset: number, buffer: Buffer) {
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > CHUNK_SIZE) throw new PayloadTooLargeException('Invalid upload chunk');
    if (!Number.isInteger(offset) || offset < 0) throw new BadRequestException('Invalid chunk offset');
    const row = await this.owned(id, viewer);
    if (row.messageId) return this.summary(row);
    if (offset < row.offset && offset + buffer.length <= row.offset && row.data.subarray(offset, offset + buffer.length).equals(buffer)) return this.summary(row);
    if (offset !== row.offset) throw new ConflictException('Upload offset changed. Resume from the server offset.');
    if (offset + buffer.length > row.size) throw new PayloadTooLargeException('Chunk exceeds declared file size');
    const result = await this.prisma.resumableUpload.updateMany({ where: { id, userId: viewer.userId, offset: row.offset, messageId: null },
      data: { data: Buffer.concat([row.data, buffer]), offset: offset + buffer.length } });
    if (!result.count) throw new ConflictException('Another tab advanced this upload. Resume from the server offset.');
    return { ...this.summary(row), offset: offset + buffer.length };
  }
  async complete(id: string, viewer: ChatViewer) {
    const row = await this.owned(id, viewer);
    if (!row.messageId && (row.offset !== row.size || createHash('sha256').update(row.data).digest('hex') !== row.sha256)) throw new ConflictException('Upload is incomplete or its checksum does not match');
    // The unique operation ID makes completion idempotent even if its response is lost.
    const prepared = row.messageId ? null : await this.attachments.prepare({ buffer: row.data, size: row.size, mimetype: row.mime, originalname: row.name });
    const message = await this.chat.postMessage(row.roomId, viewer, { ...prepared, replyToId: row.replyToId, operationId: `upload:${row.id}` });
    await this.prisma.resumableUpload.updateMany({ where: { id, userId: viewer.userId }, data: { messageId: message.id, data: Buffer.alloc(0) } });
    await this.gateway.fanOut(row.roomId, message);
    return message;
  }
  async cancel(id: string, viewer: ChatViewer) {
    await this.prisma.resumableUpload.deleteMany({ where: { id, userId: viewer.userId, messageId: null } });
    return { cancelled: true };
  }
}
