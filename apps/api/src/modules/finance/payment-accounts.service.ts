import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/rbac/audit.service';

@Injectable()
export class PaymentAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(activeOnly = false) {
    return this.prisma.paymentAccount.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: [{ sortOrder: 'asc' }, { bankName: 'asc' }],
    });
  }

  private validate(dto: Record<string, unknown>, partial: boolean) {
    const out: Record<string, unknown> = {};
    const str = (k: string, min: number, max: number, required: boolean) => {
      if (dto[k] === undefined) {
        if (required && !partial) throw new BadRequestException(`${k} is required`);
        return;
      }
      const v = String(dto[k]).trim();
      if (required && (v.length < min || v.length > max)) throw new BadRequestException(`${k} must be ${min}–${max} characters`);
      out[k] = v || null;
    };
    str('bankName', 2, 120, true);
    str('accountName', 2, 160, true);
    if (dto.accountNumber !== undefined) {
      const num = String(dto.accountNumber).replace(/\s/g, '');
      if (!/^\d{6,20}$/.test(num)) throw new BadRequestException('Account number must be 6–20 digits');
      out.accountNumber = num;
    } else if (!partial) {
      throw new BadRequestException('accountNumber is required');
    }
    if (dto.instructions !== undefined) out.instructions = dto.instructions ? String(dto.instructions).slice(0, 1000) : null;
    if (dto.isActive !== undefined) out.isActive = Boolean(dto.isActive);
    if (dto.sortOrder !== undefined) {
      const n = Number(dto.sortOrder);
      if (!Number.isInteger(n) || n < 0 || n > 9999) throw new BadRequestException('sortOrder must be 0–9999');
      out.sortOrder = n;
    }
    return out;
  }

  async create(dto: Record<string, unknown>, actorUserId: string) {
    const data = this.validate(dto, false);
    const account = await this.prisma.paymentAccount.create({ data: data as never });
    await this.audit.record({ actorUserId, action: 'PAYMENT_ACCOUNT_CREATED', entity: 'PaymentAccount', entityId: account.id, newData: { bankName: account.bankName } });
    return account;
  }

  async update(id: string, dto: Record<string, unknown>, actorUserId: string) {
    const existing = await this.prisma.paymentAccount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Payment account not found');
    const data = this.validate(dto, true);
    const account = await this.prisma.paymentAccount.update({ where: { id }, data: data as never });
    await this.audit.record({ actorUserId, action: 'PAYMENT_ACCOUNT_UPDATED', entity: 'PaymentAccount', entityId: id });
    return account;
  }

  async remove(id: string, actorUserId: string) {
    const existing = await this.prisma.paymentAccount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Payment account not found');
    await this.prisma.paymentAccount.delete({ where: { id } });
    await this.audit.record({ actorUserId, action: 'PAYMENT_ACCOUNT_DELETED', entity: 'PaymentAccount', entityId: id });
    return { deleted: true };
  }
}
