import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PaymentsService } from '../src/modules/finance/payments.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Receipt Upload and Payment Notes Validation', () => {
  let app: INestApplication;
  let paymentsService: PaymentsService;
  let prisma: PrismaService;
  let testMemberId: string;
  let testAssignmentId: string;
  let testAdminUserId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    paymentsService = app.get(PaymentsService);
    prisma = app.get(PrismaService);

    // Get an active member and dues assignment for testing
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
    if (!member || member.duesAssignments.length === 0) throw new Error('No active member with unsettled dues found in test database');
    testMemberId = member.id;
    testAssignmentId = member.duesAssignments[0].id;

    const admin = await prisma.user.findFirst();
    testAdminUserId = admin ? admin.id : '00000000-0000-0000-0000-000000000001';
  }, 45000);

  afterAll(async () => {
    if (prisma) {
      await prisma.payment.deleteMany({
        where: { payerReference: { in: ['TEST-RECEIPT-NOTE', 'TEST-LARGE-RECEIPT', 'TEST-INVALID-SIZE'] } },
      });
    }
    if (app) {
      await app.close();
    }
  }, 30000);

  it('successfully declares payment with receipt and payment note description', async () => {
    // 500 KB base64 receipt simulation
    const fakeBase64Receipt = 'data:image/jpeg;base64,' + 'A'.repeat(500 * 1024);

    const result = await paymentsService.declare(testMemberId, testAdminUserId, {
      purpose: 'MONTHLY_DUES',
      method: 'BANK_TRANSFER',
      amount: 2000,
      payerReference: 'TEST-RECEIPT-NOTE',
      description: 'Paid through GTBank mobile transfer with receipt attached',
      duesAssignmentId: testAssignmentId,
      receiptUrl: fakeBase64Receipt,
      receiptName: 'gtbank_transfer_receipt.jpg',
    });

    expect(result).toBeDefined();
    expect(result.status).toBe('PENDING');
    expect(result.description).toBe('Paid through GTBank mobile transfer with receipt attached');
    expect(result.receiptUrl).toBeDefined();
    expect(result.payerReference).toBe('TEST-RECEIPT-NOTE');
  }, 30000);

  it('supports receipt uploads up to 10 MB payload size without failure', async () => {
    // 8 MB base64 data URL string (representing a large multi-page PDF document)
    const largeReceipt = 'data:application/pdf;base64,' + 'B'.repeat(8 * 1024 * 1024);

    const result = await paymentsService.declare(testMemberId, testAdminUserId, {
      purpose: 'MONTHLY_DUES',
      method: 'BANK_TRANSFER',
      amount: 2000,
      payerReference: 'TEST-LARGE-RECEIPT',
      description: 'High resolution bank receipt statement attached',
      duesAssignmentId: testAssignmentId,
      receiptUrl: largeReceipt,
      receiptName: 'bank_statement_receipt.pdf',
    });

    expect(result).toBeDefined();
    expect(result.receiptUrl).toBe(largeReceipt);
    expect(result.receiptName).toBe('bank_statement_receipt.pdf');
  }, 30000);

  it('rejects receipt payloads exceeding the 10 MB limit with descriptive error message', async () => {
    // 15 MB string (decoded to ~11.25 MB binary, exceeding the 10 MB limit)
    const oversizedReceipt = 'data:image/png;base64,' + 'C'.repeat(15 * 1024 * 1024);

    await expect(
      paymentsService.declare(testMemberId, testAdminUserId, {
        purpose: 'MONTHLY_DUES',
        method: 'BANK_TRANSFER',
        amount: 2000,
        payerReference: 'TEST-INVALID-SIZE',
        duesAssignmentId: testAssignmentId,
        receiptUrl: oversizedReceipt,
        receiptName: 'too_large.png',
      })
    ).rejects.toThrow(BadRequestException);
  }, 30000);
});
