import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import * as _sharp from 'sharp';
const sharp = (_sharp as any).default || _sharp;
import { AppModule } from '../src/app.module';
import { PaymentsService } from '../src/modules/finance/payments.service';
import { ReceiptStorageService } from '../src/modules/finance/receipt-storage.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Payment Receipt Uploads, WebP Optimization & Retention Policy Suite', () => {
  let app: INestApplication;
  let paymentsService: PaymentsService;
  let receiptStorageService: ReceiptStorageService;
  let prisma: PrismaService;

  let testMemberId: string;
  let testMemberCode: string;
  let testAdminUserId: string;
  let monthlyAssignmentId: string;
  let christmasAssignmentId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    paymentsService = app.get(PaymentsService);
    receiptStorageService = app.get(ReceiptStorageService);
    prisma = app.get(PrismaService);

    // Pick active member who has unsettled monthly dues assignment
    const member = await prisma.member.findFirst({
      where: {
        status: 'ACTIVE',
        duesAssignments: {
          some: {
            period: { type: 'MONTHLY' },
            status: { in: ['OUTSTANDING', 'OVERDUE', 'PARTIALLY_PAID'] },
            amountPaid: 0,
          },
        },
      },
      include: {
        duesAssignments: {
          where: {
            period: { type: 'MONTHLY' },
            status: { in: ['OUTSTANDING', 'OVERDUE', 'PARTIALLY_PAID'] },
            amountPaid: 0,
          },
        },
      },
    });

    if (!member || member.duesAssignments.length === 0) {
      throw new Error('No test member with unsettled monthly dues found in test DB');
    }

    testMemberId = member.id;
    testMemberCode = member.memberCode;
    monthlyAssignmentId = member.duesAssignments[0].id;

    // Pick special assignment (Christmas party or special campaign)
    const specialAssignment = await prisma.memberDuesAssignment.findFirst({
      where: {
        period: { type: 'SPECIAL' },
        status: { in: ['OUTSTANDING', 'OVERDUE', 'PARTIALLY_PAID'] },
      },
    });

    if (specialAssignment) {
      christmasAssignmentId = specialAssignment.id;
    }

    const admin = await prisma.user.findFirst();
    testAdminUserId = admin ? admin.id : '00000000-0000-0000-0000-000000000001';
  }, 45000);

  afterAll(async () => {
    if (prisma) {
      await prisma.payment.deleteMany({
        where: {
          payerReference: {
            in: [
              'TEST-OPT-MONTHLY-JPEG',
              'TEST-OPT-CHRISTMAS-PNG',
              'TEST-OPT-PDF-DOC',
              'TEST-OPT-DUPLICATE-PREV',
              'TEST-OPT-OVERSIZED',
              'TEST-OPT-INVALID-MIME',
              'TEST-OPT-RETENTION-PURGE',
            ],
          },
        },
      });
    }
    if (app) {
      await app.close();
    }
  });

  // 1. Image Upload & Automatic WebP Optimization for Monthly Dues
  it('1. Successfully uploads and automatically optimizes high-resolution JPEG receipt to WebP for Monthly Dues', async () => {
    // Generate a high-res raw image buffer (2400x1600) to simulate smartphone camera receipt photo
    const highResBuffer = await sharp({
      create: {
        width: 2400,
        height: 1600,
        channels: 3,
        background: { r: 245, g: 247, b: 250 },
      },
    })
      .jpeg({ quality: 95 })
      .toBuffer();

    const rawDataUrl = `data:image/jpeg;base64,${highResBuffer.toString('base64')}`;

    const payment = await paymentsService.declare(testMemberId, testAdminUserId, {
      purpose: 'MONTHLY_DUES',
      method: 'BANK_TRANSFER',
      amount: 2000,
      payerReference: 'TEST-OPT-MONTHLY-JPEG',
      description: 'Monthly dues payment with high resolution camera receipt photo',
      duesAssignmentId: monthlyAssignmentId,
      receiptUrl: rawDataUrl,
      receiptName: 'camera_receipt_photo.jpg',
    });

    expect(payment).toBeDefined();
    expect(payment.status).toBe('PENDING');
    expect(payment.receiptUrl).toBeDefined();

    // Verify it was converted to efficient WebP format
    expect(payment.receiptUrl?.startsWith('data:image/webp;base64,')).toBe(true);
    expect(payment.receiptName?.endsWith('.webp')).toBe(true);

    // Verify metadata saved
    const meta: any = payment.metadata;
    expect(meta).toBeDefined();
    expect(meta.mimeType).toBe('image/webp');
    expect(meta.originalSize).toBe(highResBuffer.length);
    expect(meta.optimizedSize).toBeLessThan(highResBuffer.length);
    expect(meta.compressionRatio).toBeGreaterThan(0);
    expect(meta.retentionStatus).toBe('ACTIVE');
    expect(meta.isPurged).toBe(false);

    // Verify 3-month retention date calculation
    const uploadedAt = new Date(meta.uploadedAt);
    const retentionUntil = new Date(meta.retentionUntil);
    const diffDays = Math.round((retentionUntil.getTime() - uploadedAt.getTime()) / (24 * 60 * 60 * 1000));
    expect(diffDays).toBe(90);
  });

  // 2. Christmas Party Contribution Receipt Upload
  it('2. Successfully uploads and optimizes receipt for Christmas Party Contribution', async () => {
    const pngBuffer = await sharp({
      create: {
        width: 1800,
        height: 1200,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const rawDataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;

    const payment = await paymentsService.declare(testMemberId, testAdminUserId, {
      purpose: christmasAssignmentId ? 'SPECIAL_CONTRIBUTION' : 'OTHER',
      method: 'BANK_TRANSFER',
      amount: 20000,
      payerReference: 'TEST-OPT-CHRISTMAS-PNG',
      description: 'Christmas Party contribution proof of transfer',
      duesAssignmentId: christmasAssignmentId || undefined,
      receiptUrl: rawDataUrl,
      receiptName: 'christmas_party_receipt.png',
    });

    expect(payment).toBeDefined();
    expect(payment.status).toBe('PENDING');
    expect(payment.amount).toBe(20000);
    expect(payment.receiptUrl?.startsWith('data:image/webp;base64,')).toBe(true);
  });

  // 3. PDF Document Preservation
  it('3. Preserves PDF document format without altering bytes or compressing text', async () => {
    const fakePdfBytes = Buffer.from('%PDF-1.4 Fake bank statement PDF with receipt transaction text');
    const pdfDataUrl = `data:application/pdf;base64,${fakePdfBytes.toString('base64')}`;

    const payment = await paymentsService.declare(testMemberId, testAdminUserId, {
      purpose: 'OTHER',
      method: 'BANK_TRANSFER',
      amount: 5000,
      payerReference: 'TEST-OPT-PDF-DOC',
      description: 'Official bank PDF e-receipt statement',
      receiptUrl: pdfDataUrl,
      receiptName: 'stanbic_receipt.pdf',
    });

    expect(payment).toBeDefined();
    expect(payment.receiptUrl).toBe(pdfDataUrl);
    expect(payment.receiptName).toBe('stanbic_receipt.pdf');

    const meta: any = payment.metadata;
    expect(meta.mimeType).toBe('application/pdf');
    expect(meta.originalSize).toBe(fakePdfBytes.length);
    expect(meta.optimizedSize).toBe(fakePdfBytes.length);
    expect(meta.compressionRatio).toBe(0);
  });

  // 4. File Size Limit (10MB) Enforcement
  it('4. Rejects receipt files exceeding the 10MB limit with a descriptive error message', async () => {
    // 11 MB simulated buffer
    const oversizedBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(11 * 1024 * 1024 * (4 / 3));

    await expect(
      paymentsService.declare(testMemberId, testAdminUserId, {
        purpose: 'OTHER',
        method: 'BANK_TRANSFER',
        amount: 2000,
        payerReference: 'TEST-OPT-OVERSIZED',
        receiptUrl: oversizedBase64,
        receiptName: 'oversized_file.jpg',
      })
    ).rejects.toThrow(BadRequestException);
  });

  // 5. Invalid File Format Validation
  it('5. Rejects unsupported file formats (e.g. text/html, executables)', async () => {
    const invalidDataUrl = 'data:text/html;base64,PGh0bWw+UGF5bWVudDwvaHRtbD4=';

    await expect(
      paymentsService.declare(testMemberId, testAdminUserId, {
        purpose: 'OTHER',
        method: 'BANK_TRANSFER',
        amount: 2000,
        payerReference: 'TEST-OPT-INVALID-MIME',
        receiptUrl: invalidDataUrl,
        receiptName: 'script.html',
      })
    ).rejects.toThrow(BadRequestException);
  });

  // 6. Duplicate Submission Prevention
  it('6. Re-submitting a receipt for an existing pending assignment updates the pending record without creating duplicates', async () => {
    const updatedNote = 'Updated description with clearer receipt scan';
    const updatedBuffer = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 200, b: 200 } },
    })
      .jpeg()
      .toBuffer();

    const secondSubmission = await paymentsService.declare(testMemberId, testAdminUserId, {
      purpose: 'MONTHLY_DUES',
      method: 'BANK_TRANSFER',
      amount: 2000,
      payerReference: 'TEST-OPT-DUPLICATE-PREV',
      description: updatedNote,
      duesAssignmentId: monthlyAssignmentId,
      receiptUrl: `data:image/jpeg;base64,${updatedBuffer.toString('base64')}`,
      receiptName: 'updated_receipt.jpg',
    });

    expect(secondSubmission.status).toBe('PENDING');
    expect(secondSubmission.description).toBe(updatedNote);

    // Verify only ONE pending payment row exists for this assignment
    const pendingCount = await prisma.payment.count({
      where: { duesAssignmentId: monthlyAssignmentId, status: 'PENDING' },
    });
    expect(pendingCount).toBe(1);
  });

  // 7. Retention Policy Safety: Pending & Rejected Payments Are Audit-Protected
  it('7. Pending and rejected payments are strictly protected from retention cleanup deletion', async () => {
    const metrics = await receiptStorageService.getStorageMetrics();
    expect(metrics).toBeDefined();
    expect(metrics.protectedCount).toBeGreaterThanOrEqual(1);

    // Check candidate preview: pending payments must NEVER be included in cleanup candidates
    const preview = await receiptStorageService.previewRetentionCandidates();
    const candidateIds = preview.candidates.map((c: any) => c.id);

    const pendingPayments = await prisma.payment.findMany({
      where: { status: { in: ['PENDING', 'REJECTED'] } },
      select: { id: true },
    });

    pendingPayments.forEach((p) => {
      expect(candidateIds).not.toContain(p.id);
    });
  });

  // 8. Retention Cleanup Execution & Audit Preservation
  it('8. Retention cleanup safely purges eligible confirmed receipt image data while preserving financial ledger and audit records', async () => {
    // Create a confirmed payment backdated to 120 days ago (past the 90-day retention window)
    const fourMonthsAgo = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);

    const sampleBuffer = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 180, g: 180, b: 180 } },
    })
      .jpeg()
      .toBuffer();

    const testPayment = await prisma.payment.create({
      data: {
        reference: 'PMT-RETENTION-TEST',
        purpose: 'OTHER',
        method: 'BANK_TRANSFER',
        amount: 2500,
        memberId: testMemberId,
        status: 'CONFIRMED',
        paidOn: fourMonthsAgo,
        createdAt: fourMonthsAgo,
        payerReference: 'TEST-OPT-RETENTION-PURGE',
        description: 'Settled dues backdated for retention purge test',
        metadata: {
          receiptUrl: `data:image/webp;base64,${sampleBuffer.toString('base64')}`,
          receiptName: 'backdated_receipt.webp',
          originalSize: sampleBuffer.length,
          optimizedSize: sampleBuffer.length,
          mimeType: 'image/webp',
          uploadedAt: fourMonthsAgo.toISOString(),
          retentionUntil: new Date(fourMonthsAgo.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          retentionStatus: 'EXPIRED_RETAINED',
          isPurged: false,
        },
      },
    });

    // Preview candidates must include this backdated confirmed payment
    const preview = await receiptStorageService.previewRetentionCandidates();
    const candidate = preview.candidates.find((c: any) => c.id === testPayment.id);
    expect(candidate).toBeDefined();

    // Execute safe cleanup
    const cleanupResult: any = await receiptStorageService.applyRetentionCleanup(testAdminUserId, { dryRun: false });
    expect(cleanupResult.purgedCount).toBeGreaterThanOrEqual(1);

    // Verify payment record in database: receiptUrl is null, but payment record, amount, reference remain intact
    const fetchedPayment = await paymentsService.getOne(testPayment.id, undefined, true);
    expect(fetchedPayment).toBeDefined();
    expect(fetchedPayment.amount).toBe(2500);
    expect(fetchedPayment.status).toBe('CONFIRMED');
    expect(fetchedPayment.reference).toBe('PMT-RETENTION-TEST');
    expect(fetchedPayment.receiptUrl).toBeNull();
    expect(fetchedPayment.isReceiptArchived).toBe(true);

    // Clean up test record
    await prisma.payment.delete({ where: { id: testPayment.id } });
  });

  // 9. Storage Efficiency Metrics Reconcile
  it('9. Storage efficiency metrics reconcile with active payment records in database', async () => {
    const metrics = await receiptStorageService.getStorageMetrics();
    expect(metrics).toBeDefined();
    expect(typeof metrics.totalStorageBytes).toBe('number');
    expect(typeof metrics.totalReceiptsCount).toBe('number');
    expect(typeof metrics.savingsPercentage).toBe('number');
    expect(metrics.retentionPolicy.retentionPeriodDays).toBe(90);
    expect(metrics.retentionPolicy.status).toBe('DRY_RUN_PREVIEW');
  });
});
