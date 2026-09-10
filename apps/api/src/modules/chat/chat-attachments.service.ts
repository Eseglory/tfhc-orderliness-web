import { BadRequestException, Injectable } from '@nestjs/common';

// sharp 0.35 is a CommonJS module whose export is the callable factory; the
// bundled ESM-shaped types don't expose call signatures, so require it directly.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp: typeof import('sharp').default = require('sharp');

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB Hard Limit
const AUDIO_MIME = new Set(['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-m4a', 'audio/aac']);
const DOCUMENT_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
]);

export interface PreparedAttachment {
  type: 'IMAGE' | 'AUDIO' | 'SYSTEM' | 'TEXT';
  attachmentUrl: string;
  attachmentMeta: Record<string, unknown>;
}

@Injectable()
export class ChatAttachmentsService {
  async prepare(
    file: { buffer: Buffer; size: number; mimetype?: string; originalname?: string } | undefined,
  ): Promise<PreparedAttachment> {
    if (!file || !file.buffer?.length) throw new BadRequestException('No file uploaded');
    
    // Server-side hard validation: 2 MB maximum
    if (file.size > MAX_FILE_BYTES || file.buffer.length > MAX_FILE_BYTES) {
      throw new BadRequestException('Maximum file size is 2 MB.');
    }

    const mime = (file.mimetype || '').toLowerCase();

    if (mime.startsWith('image/')) {
      let output: Buffer;
      let width: number | undefined;
      let height: number | undefined;
      try {
        const image = sharp(file.buffer, { limitInputPixels: 25000000, animated: false });
        const meta = await image.metadata();
        if (!['jpeg', 'png', 'webp', 'gif'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1) {
          throw new Error('Unsupported image');
        }
        const resized = await image
          .rotate()
          .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer({ resolveWithObject: true });
        output = resized.data;
        width = resized.info.width;
        height = resized.info.height;
      } catch {
        throw new BadRequestException('The image could not be processed');
      }
      return {
        type: 'IMAGE',
        attachmentUrl: `data:image/webp;base64,${output.toString('base64')}`,
        attachmentMeta: { kind: 'image', width, height, bytes: output.length, name: file.originalname ?? 'image.webp' },
      };
    }

    if (mime.startsWith('audio/')) {
      if (!AUDIO_MIME.has(mime)) throw new BadRequestException('Unsupported audio format');
      return {
        type: 'AUDIO',
        attachmentUrl: `data:${mime};base64,${file.buffer.toString('base64')}`,
        attachmentMeta: { kind: 'audio', mime, bytes: file.size, name: file.originalname ?? 'audio' },
      };
    }

    if (DOCUMENT_MIME.has(mime)) {
      return {
        type: 'TEXT',
        attachmentUrl: `data:${mime};base64,${file.buffer.toString('base64')}`,
        attachmentMeta: { kind: 'document', mime, bytes: file.size, name: file.originalname ?? 'document' },
      };
    }

    throw new BadRequestException('Unsupported attachment format. Only images, audio, and documents up to 2 MB are supported.');
  }
}

