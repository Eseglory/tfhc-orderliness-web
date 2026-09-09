import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ExpenseStatus, FinancePaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/rbac/audit.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { makeReference, money, parseDateOnly } from './finance.util';

const ENTITY = 'Expense';
const EDITABLE: ExpenseStatus[] = ['DRAFT', 'REJECTED'];
const METHODS = Object.values(FinancePaymentMethod);

@Injectable()
export class ExpensesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
  ) {}

  onModuleInit() {
    this.approvals.registerFinalizer(ENTITY, async ({ entityId, approved, actorUserId, comment }) => {
      await this.prisma.expense.update({
        where: { id: entityId },
        data: approved
          ? { status: 'APPROVED', rejectionReason: null }
          : { status: 'REJECTED', rejectionReason: comment ?? 'Rejected in review' },
      });
      await this.audit.record({
        actorUserId,
        action: approved ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED',
        entity: ENTITY,
        entityId,
        reason: comment,
      });
    });
  }

  categories() {
    return this.prisma.expenseCategory.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  }

  private parse(dto: Record<string, unknown>, partial: boolean) {
    const out: Prisma.ExpenseUncheckedCreateInput | Prisma.ExpenseUncheckedUpdateInput = {} as never;
    const need = (cond: boolean, msg: string) => {
      if (!cond) throw new BadRequestException(msg);
    };

    if (!partial || dto.title !== undefined) {
      need(typeof dto.title === 'string' && dto.title.trim().length >= 2, 'A title is required');
      (out as { title: string }).title = (dto.title as string).trim().slice(0, 200);
    }
    if (!partial || dto.categoryId !== undefined) {
      need(typeof dto.categoryId === 'string' && !!dto.categoryId, 'Choose a category');
      (out as { categoryId: string }).categoryId = dto.categoryId as string;
    }
    if (!partial || dto.amount !== undefined) {
      try {
        (out as { amount: number }).amount = money(dto.amount, 'Amount');
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
    }
    if (!partial || dto.incurredOn !== undefined) {
      try {
        (out as { incurredOn: Date }).incurredOn = parseDateOnly(dto.incurredOn, 'Date incurred');
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
    }
    if (dto.description !== undefined) (out as { description: string | null }).description = dto.description ? String(dto.description).slice(0, 4000) : null;
    if (dto.vendorName !== undefined) (out as { vendorName: string | null }).vendorName = dto.vendorName ? String(dto.vendorName).slice(0, 200) : null;
    if (dto.paymentReference !== undefined) (out as { paymentReference: string | null }).paymentReference = dto.paymentReference ? String(dto.paymentReference).slice(0, 200) : null;
    if (dto.attachmentUrl !== undefined) (out as { attachmentUrl: string | null }).attachmentUrl = dto.attachmentUrl ? String(dto.attachmentUrl).slice(0, 1000) : null;
    if (dto.paymentMethod !== undefined) {
      if (dto.paymentMethod && !METHODS.includes(dto.paymentMethod as FinancePaymentMethod)) throw new BadRequestException('Invalid payment method');
      (out as { paymentMethod: FinancePaymentMethod | null }).paymentMethod = (dto.paymentMethod as FinancePaymentMethod) || null;
    }
    return out;
  }

  async create(userId: string, dto: Record<string, unknown>) {
    const data = this.parse(dto, false) as Prisma.ExpenseUncheckedCreateInput;
    const category = await this.prisma.expenseCategory.findUnique({ where: { id: data.categoryId } });
    if (!category || !category.active) throw new BadRequestException('Unknown or inactive category');

    const expense = await this.prisma.expense.create({
      data: { ...data, reference: makeReference('EXP'), createdByUserId: userId, status: 'DRAFT' },
      include: { category: true },
    });
    await this.audit.record({ actorUserId: userId, action: 'EXPENSE_CREATED', entity: ENTITY, entityId: expense.id, newData: { reference: expense.reference, amount: expense.amount } });

    if (dto.submit === true) return this.submit(expense.id, userId);
    return this.getOne(expense.id);
  }

  async update(id: string, userId: string, dto: Record<string, unknown>) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Expense not found');
    if (!EDITABLE.includes(expense.status)) throw new BadRequestException(`A ${expense.status.toLowerCase().replace('_', ' ')} expense cannot be edited`);
    const data = this.parse(dto, true);
    if ((data as { categoryId?: string }).categoryId) {
      const cat = await this.prisma.expenseCategory.findUnique({ where: { id: (data as { categoryId: string }).categoryId } });
      if (!cat) throw new BadRequestException('Unknown category');
    }
    await this.prisma.expense.update({ where: { id }, data: data as Prisma.ExpenseUncheckedUpdateInput });
    await this.audit.record({ actorUserId: userId, action: 'EXPENSE_UPDATED', entity: ENTITY, entityId: id });
    if (dto.submit === true) return this.submit(id, userId);
    return this.getOne(id);
  }

  async submit(id: string, userId: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id }, include: { category: true } });
    if (!expense) throw new NotFoundException('Expense not found');
    if (!EDITABLE.includes(expense.status)) throw new BadRequestException('Only draft or returned expenses can be submitted');

    const approval = await this.approvals.open({
      requestType: 'EXPENSE',
      entityType: ENTITY,
      entityId: id,
      summary: `Expense: ${expense.title} — ₦${expense.amount.toLocaleString()} (${expense.category.name})`,
      amount: expense.amount,
      requestedByUserId: userId,
    });

    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        status: approval ? 'PENDING_APPROVAL' : 'APPROVED', // no workflow ⇒ auto-approve
        approvalRequestId: approval?.id ?? null,
        rejectionReason: null,
      },
    });
    await this.audit.record({ actorUserId: userId, action: 'EXPENSE_SUBMITTED', entity: ENTITY, entityId: id, newData: { status: updated.status } });
    return this.getOne(id);
  }

  async markPaid(id: string, userId: string, dto: { paymentMethod?: string; paymentReference?: string; paidOn?: string }) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Expense not found');
    if (expense.status !== 'APPROVED') throw new BadRequestException('Only approved expenses can be marked paid');
    if (dto.paymentMethod && !METHODS.includes(dto.paymentMethod as FinancePaymentMethod)) throw new BadRequestException('Invalid payment method');
    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        status: 'PAID',
        paidOn: dto.paidOn ? parseDateOnly(dto.paidOn, 'Payment date') : new Date(),
        paidByUserId: userId,
        paymentMethod: (dto.paymentMethod as FinancePaymentMethod) || expense.paymentMethod,
        paymentReference: dto.paymentReference?.slice(0, 200) ?? expense.paymentReference,
      },
      include: { category: true },
    });
    await this.audit.record({ actorUserId: userId, action: 'EXPENSE_PAID', entity: ENTITY, entityId: id });
    return this.shape(updated);
  }

  async cancel(id: string, userId: string, reason?: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id }, include: { approvalRequest: true } });
    if (!expense) throw new NotFoundException('Expense not found');
    if (['PAID', 'CANCELLED'].includes(expense.status)) throw new BadRequestException('This expense cannot be cancelled');
    if (expense.approvalRequestId && expense.approvalRequest?.status === 'PENDING') {
      await this.approvals.cancel(expense.approvalRequestId, userId).catch(() => undefined);
    }
    await this.prisma.expense.update({ where: { id }, data: { status: 'CANCELLED', rejectionReason: reason?.slice(0, 500) || null } });
    await this.audit.record({ actorUserId: userId, action: 'EXPENSE_CANCELLED', entity: ENTITY, entityId: id, reason });
    return this.getOne(id);
  }

  async list(query: { status?: string; categoryId?: string; from?: string; to?: string; search?: string }) {
    const where: Prisma.ExpenseWhereInput = {};
    if (query.status && Object.values(ExpenseStatus).includes(query.status as ExpenseStatus)) where.status = query.status as ExpenseStatus;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.from || query.to) where.incurredOn = { ...(query.from ? { gte: parseDateOnly(query.from, 'from') } : {}), ...(query.to ? { lte: parseDateOnly(query.to, 'to') } : {}) };
    if (query.search?.trim())
      where.OR = [
        { title: { contains: query.search.trim(), mode: 'insensitive' } },
        { reference: { contains: query.search.trim(), mode: 'insensitive' } },
        { vendorName: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    const rows = await this.prisma.expense.findMany({
      where,
      include: { category: true, createdByUser: { select: { email: true, member: { select: { firstName: true, lastName: true } } } }, approvalRequest: { select: { status: true, currentStepOrder: true } } },
      orderBy: { incurredOn: 'desc' },
      take: 500,
    });
    return rows.map((r) => this.shape(r));
  }

  async getOne(id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: { category: true, createdByUser: { select: { email: true, member: { select: { firstName: true, lastName: true } } } }, approvalRequest: { select: { status: true, currentStepOrder: true } } },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    const approval = expense.approvalRequestId ? await this.approvals.getById(expense.approvalRequestId).catch(() => null) : null;
    return { ...this.shape(expense), approval };
  }

  private shape(e: {
    id: string;
    reference: string;
    title: string;
    description?: string | null;
    amount: number;
    incurredOn: Date;
    vendorName: string | null;
    paymentMethod: string | null;
    paymentReference: string | null;
    attachmentUrl: string | null;
    status: string;
    paidOn: Date | null;
    rejectionReason: string | null;
    createdAt: Date;
    category?: { id: string; name: string } | null;
    createdByUser?: { email: string; member: { firstName: string; lastName: string } | null } | null;
    approvalRequest?: { status: string; currentStepOrder: number } | null;
  }) {
    return {
      id: e.id,
      reference: e.reference,
      title: e.title,
      description: e.description ?? null,
      amount: e.amount,
      incurredOn: e.incurredOn,
      vendorName: e.vendorName,
      paymentMethod: e.paymentMethod,
      paymentReference: e.paymentReference,
      attachmentUrl: e.attachmentUrl,
      status: e.status,
      paidOn: e.paidOn,
      rejectionReason: e.rejectionReason,
      createdAt: e.createdAt,
      category: e.category ? { id: e.category.id, name: e.category.name } : null,
      createdBy: e.createdByUser?.member
        ? `${e.createdByUser.member.firstName} ${e.createdByUser.member.lastName}`.trim()
        : e.createdByUser?.email ?? null,
      approvalStatus: e.approvalRequest?.status ?? null,
    };
  }
}
