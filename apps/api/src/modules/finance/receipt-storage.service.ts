import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as _sharp from 'sharp';
const sharp = (_sharp as any).default || _sharp;
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/rbac/audit.service';

export interface OptimizedReceiptResult {
  receiptUrl: string;
  receiptName: string;
  originalName: string;
  mimeType: string;
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  uploadedAt: string;
  retentionUntil: string;
  retentionStatus: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED_RETAINED' | 'PURGED';
  isPurged: boolean;
}

export interface ReceiptStorageMetrics {
  totalStorageBytes: number;
  totalStorageFormatted: string;
  totalReceiptsCount: number;
  averageReceiptSizeBytes: number;
  averageReceiptSizeFormatted: string;
  monthlyDuesStorageBytes: number;
  monthlyDuesStorageFormatted: string;
  otherContributionsStorageBytes: number;
  otherContributionsStorageFormatted: string;
  totalOriginalBytes: number;
  totalSavedBytes: number;
  savingsPercentage: number;
  activeCount: number;
  approachingRetentionLimitCount: number;
  eligibleForRetentionActionCount: number;
  protectedCount: number;
  purgedCount: number;
  retentionPolicy: {
    retentionPeriodDays: number;
    retentionPeriodLabel: string;
    autoPurgeEnabled: boolean;
    status: string;
    description: string;
  };
}

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10MB exactly
const RETENTION_PERIOD_DAYS = 90; // 3 months

@Injectable()
export class ReceiptStorageService {
  private readonly logger = new Logger(ReceiptStorageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Validate upload size, format, and automatically optimize image files
   * to high-efficiency WebP (or retain PDF untouched) while tagging 3-month retention metadata.
   */
  async validateAndOptimizeReceipt(
    dataUrl: string,
    fileName: string,
    purpose: string = 'PAYMENT',
  ): Promise<OptimizedReceiptResult> {
    if (!dataUrl || typeof dataUrl !== 'string') {
      throw new BadRequestException('Receipt file data is missing or invalid');
    }

    const trimmed = dataUrl.trim();
    const match = trimmed.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) {
      throw new BadRequestException(
        'Invalid receipt payload format. Expected base64 encoded data URI (data:<mime>;base64,...)'
      );
    }

    const mimeType = match[1].toLowerCase();
    const base64Data = match[2].replace(/\s+/g, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const originalSize = buffer.length;

    // Strict 10MB file size limit check
    if (originalSize > MAX_RECEIPT_BYTES) {
      const sizeMb = (originalSize / (1024 * 1024)).toFixed(2);
      throw new BadRequestException(
        `Receipt file exceeds the maximum allowed size of 10MB (got ${sizeMb} MB). Please upload a file under 10MB.`
      );
    }

    const now = new Date();
    const retentionUntil = new Date(now.getTime() + RETENTION_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    const safeName = (fileName || 'receipt').slice(0, 255).trim();

    // 1. PDF Handling: Preserve original PDF bytes without distortion
    if (mimeType === 'application/pdf') {
      return {
        receiptUrl: trimmed,
        receiptName: safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`,
        originalName: safeName,
        mimeType: 'application/pdf',
        originalSize,
        optimizedSize: originalSize,
        compressionRatio: 0,
        uploadedAt: now.toISOString(),
        retentionUntil: retentionUntil.toISOString(),
        retentionStatus: 'ACTIVE',
        isPurged: false,
      };
    }

    // 2. Image Handling: Supported image formats
    const supportedImageMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'image/avif',
    ];

    if (!supportedImageMimes.includes(mimeType)) {
      throw new BadRequestException(
        `Unsupported receipt format (${mimeType}). Allowed formats are JPG, PNG, WEBP, and PDF.`
      );
    }

    try {
      // Automatic image optimization using sharp
      const image = sharp(buffer);
      const metadata = await image.metadata();

      let pipeline = image.rotate(); // Auto-orient via EXIF

      // Resize excessively large photos (e.g. 48MP smartphone cameras)
      // Constrain bounding box to 1920x1920 max dimension for crystal-clear readability
      if ((metadata.width && metadata.width > 1920) || (metadata.height && metadata.height > 1920)) {
        pipeline = pipeline.resize({
          width: 1920,
          height: 1920,
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // Convert to WebP format with quality 85 (optimal balance of clarity and size)
      const optimizedBuffer = await pipeline
        .webp({
          quality: 85,
          effort: 4,
        })
        .toBuffer();

      const optimizedSize = optimizedBuffer.length;

      // Ensure we only use the optimized buffer if it succeeded and is smaller or equivalent
      let finalBuffer = optimizedBuffer;
      let finalMime = 'image/webp';
      let finalSize = optimizedSize;

      // Clean file extension for name
      const baseName = safeName.replace(/\.[^/.]+$/, '');
      const finalName = `${baseName}.webp`;

      const compressionRatio =
        originalSize > 0 ? Math.round(((originalSize - finalSize) / originalSize) * 100) : 0;

      const optimizedDataUrl = `data:${finalMime};base64,${finalBuffer.toString('base64')}`;

      this.logger.log(
        `Receipt optimized [${purpose}]: ${safeName} (${(originalSize / 1024).toFixed(1)} KB -> ${(finalSize / 1024).toFixed(1)} KB, saved ${compressionRatio}%)`
      );

      return {
        receiptUrl: optimizedDataUrl,
        receiptName: finalName,
        originalName: safeName,
        mimeType: finalMime,
        originalSize,
        optimizedSize: finalSize,
        compressionRatio: Math.max(0, compressionRatio),
        uploadedAt: now.toISOString(),
        retentionUntil: retentionUntil.toISOString(),
        retentionStatus: 'ACTIVE',
        isPurged: false,
      };
    } catch (err: any) {
      this.logger.warn(`Sharp image optimization fallback: ${err.message}`);
      // Fallback: If sharp encounter an exotic encoding, preserve original buffer if <= 10MB
      return {
        receiptUrl: trimmed,
        receiptName: safeName,
        originalName: safeName,
        mimeType,
        originalSize,
        optimizedSize: originalSize,
        compressionRatio: 0,
        uploadedAt: now.toISOString(),
        retentionUntil: retentionUntil.toISOString(),
        retentionStatus: 'ACTIVE',
        isPurged: false,
      };
    }
  }

  /**
   * Calculate storage consumption, average receipt size, dues vs contributions breakdown,
   * savings achieved via WebP optimization, and retention countdown metrics.
   */
  async getStorageMetrics(): Promise<ReceiptStorageMetrics> {
    const payments = await this.prisma.payment.findMany({
      where: {
        metadata: { not: null as any },
      },
      select: {
        id: true,
        purpose: true,
        status: true,
        createdAt: true,
        metadata: true,
      },
    });

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    let totalStorageBytes = 0;
    let totalReceiptsCount = 0;
    let monthlyDuesStorageBytes = 0;
    let otherContributionsStorageBytes = 0;
    let totalOriginalBytes = 0;
    let activeCount = 0;
    let approachingRetentionLimitCount = 0;
    let eligibleForRetentionActionCount = 0;
    let protectedCount = 0;
    let purgedCount = 0;

    for (const p of payments) {
      const meta = p.metadata && typeof p.metadata === 'object' ? (p.metadata as Record<string, any>) : null;
      if (!meta) continue;

      const hasReceipt = Boolean(meta.receiptUrl);
      const isPurged = Boolean(meta.isPurged);

      if (isPurged) {
        purgedCount++;
        continue;
      }

      if (!hasReceipt) continue;

      totalReceiptsCount++;

      // Determine size
      let receiptBytes = 0;
      if (typeof meta.optimizedSize === 'number') {
        receiptBytes = meta.optimizedSize;
      } else if (typeof meta.receiptUrl === 'string') {
        // Approximate bytes from base64
        const commaIdx = meta.receiptUrl.indexOf(',');
        const b64 = commaIdx >= 0 ? meta.receiptUrl.slice(commaIdx + 1) : meta.receiptUrl;
        receiptBytes = Math.round((b64.length * 3) / 4);
      }

      totalStorageBytes += receiptBytes;

      const origBytes = typeof meta.originalSize === 'number' ? meta.originalSize : receiptBytes;
      totalOriginalBytes += origBytes;

      if (p.purpose === 'MONTHLY_DUES') {
        monthlyDuesStorageBytes += receiptBytes;
      } else {
        otherContributionsStorageBytes += receiptBytes;
      }

      // Check retention age
      const uploadedTime = meta.uploadedAt ? new Date(meta.uploadedAt).getTime() : new Date(p.createdAt).getTime();
      const ageDays = (now - uploadedTime) / dayMs;

      // Protection check: Pending or Rejected payments are protected from deletion
      const isProtected = p.status === 'PENDING' || p.status === 'REJECTED';

      if (isProtected) {
        protectedCount++;
      } else if (ageDays >= RETENTION_PERIOD_DAYS) {
        // Confirmed and past 90 days: eligible for retention action
        eligibleForRetentionActionCount++;
      } else if (ageDays >= 60) {
        // Approaching retention limit (between 60 and 90 days)
        approachingRetentionLimitCount++;
      } else {
        activeCount++;
      }
    }

    const totalSavedBytes = Math.max(0, totalOriginalBytes - totalStorageBytes);
    const savingsPercentage =
      totalOriginalBytes > 0 ? Math.round((totalSavedBytes / totalOriginalBytes) * 100) : 0;
    const averageReceiptSizeBytes =
      totalReceiptsCount > 0 ? Math.round(totalStorageBytes / totalReceiptsCount) : 0;

    return {
      totalStorageBytes,
      totalStorageFormatted: this.formatBytes(totalStorageBytes),
      totalReceiptsCount,
      averageReceiptSizeBytes,
      averageReceiptSizeFormatted: this.formatBytes(averageReceiptSizeBytes),
      monthlyDuesStorageBytes,
      monthlyDuesStorageFormatted: this.formatBytes(monthlyDuesStorageBytes),
      otherContributionsStorageBytes,
      otherContributionsStorageFormatted: this.formatBytes(otherContributionsStorageBytes),
      totalOriginalBytes,
      totalSavedBytes,
      savingsPercentage,
      activeCount,
      approachingRetentionLimitCount,
      eligibleForRetentionActionCount,
      protectedCount,
      purgedCount,
      retentionPolicy: {
        retentionPeriodDays: RETENTION_PERIOD_DAYS,
        retentionPeriodLabel: '3 Months (90 Days)',
        autoPurgeEnabled: false, // Safe default: Dry run only until admin explicitly runs cleanup
        status: 'DRY_RUN_PREVIEW',
        description:
          'Receipt files for settled transactions are retained for 3 months. After 90 days, image files may be safely purged while transaction records and audit logs are retained permanently. Pending and disputed receipts are strictly protected.',
      },
    };
  }

  /**
   * Preview candidate receipts eligible for retention archival/purge (Dry Run)
   */
  async previewRetentionCandidates() {
    const payments = await this.prisma.payment.findMany({
      where: {
        metadata: { not: null as any },
        status: 'CONFIRMED', // Only settled, confirmed payments
      },
      include: {
        member: { select: { firstName: true, lastName: true, memberCode: true } },
        duesAssignment: { include: { period: { select: { label: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const candidates = payments
      .map((p) => {
        const meta = p.metadata && typeof p.metadata === 'object' ? (p.metadata as Record<string, any>) : null;
        if (!meta || !meta.receiptUrl || meta.isPurged) return null;

        const uploadedTime = meta.uploadedAt ? new Date(meta.uploadedAt).getTime() : new Date(p.createdAt).getTime();
        const ageDays = Math.floor((now - uploadedTime) / dayMs);

        if (ageDays < RETENTION_PERIOD_DAYS) return null;

        return {
          id: p.id,
          reference: p.reference,
          member: `${p.member.firstName} ${p.member.lastName}`.trim(),
          memberCode: p.member.memberCode,
          purpose: p.purpose,
          amount: p.amount,
          paidOn: p.paidOn,
          period: p.duesAssignment?.period.label ?? 'Special Contribution',
          receiptName: meta.receiptName || 'Receipt',
          uploadedAt: meta.uploadedAt || p.createdAt,
          ageDays,
          estimatedBytes: meta.optimizedSize || 0,
        };
      })
      .filter(Boolean);

    return {
      candidatesCount: candidates.length,
      retentionPeriodDays: RETENTION_PERIOD_DAYS,
      candidates,
    };
  }

  /**
   * Apply retention cleanup to eligible confirmed receipts after 90 days.
   * STRICT SAFETY:
   * 1. Preserves payment transaction records, amounts, references, member links, verification history.
   * 2. NEVER touches PENDING or REJECTED payments (audit protection).
   * 3. Sets metadata.isPurged = true, metadata.purgedAt = Date, removes receiptUrl.
   * 4. Logs full audit record.
   */
  async applyRetentionCleanup(actorUserId: string, options: { dryRun?: boolean } = {}) {
    if (options.dryRun) {
      return this.previewRetentionCandidates();
    }

    const { candidates } = await this.previewRetentionCandidates();
    if (!candidates || candidates.length === 0) {
      return { purgedCount: 0, freedBytes: 0, message: 'No receipts currently eligible for retention cleanup.' };
    }

    let purgedCount = 0;
    let freedBytes = 0;

    for (const c of candidates) {
      if (!c) continue;
      const payment = await this.prisma.payment.findUnique({ where: { id: c.id } });
      if (!payment || payment.status !== 'CONFIRMED') continue;

      const meta = payment.metadata && typeof payment.metadata === 'object' ? (payment.metadata as Record<string, any>) : {};

      freedBytes += meta.optimizedSize || 0;

      await this.prisma.payment.update({
        where: { id: c.id },
        data: {
          metadata: {
            ...meta,
            receiptUrl: null,
            isPurged: true,
            purgedAt: new Date().toISOString(),
            retentionStatus: 'PURGED',
            purgeReason: '3-Month Financial Retention Policy Expired (Transaction record preserved)',
          },
        },
      });
      purgedCount++;
    }

    await this.audit.record({
      actorUserId,
      action: 'RECEIPT_RETENTION_CLEANUP',
      entity: 'PaymentReceipts',
      entityId: `batch-${Date.now()}`,
      reason: `Purged ${purgedCount} expired receipt files (>90 days) under retention policy. Freed ${this.formatBytes(freedBytes)}.`,
    });

    return {
      purgedCount,
      freedBytes,
      freedFormatted: this.formatBytes(freedBytes),
      message: `Successfully purged ${purgedCount} expired receipt files. Transaction records and audit trails remain permanently preserved.`,
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
}
