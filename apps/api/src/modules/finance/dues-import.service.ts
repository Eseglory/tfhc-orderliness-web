import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { bestNameMatch, normalizeNameTokens } from '@tfhc/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/rbac/audit.service';
import { makeReference } from './finance.util';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface DuesMatrixRow {
  name: string;
  amount?: number;
  paidMonths?: number[];
  waivedMonths?: number[];
  newMember?: boolean;
  note?: string;
}

export interface DuesMatrixImport {
  year: number;
  defaultAmount?: number;
  dueDayOfMonth?: number;
  rows: DuesMatrixRow[];
  /** normalised-name → directory email, built from the member-directory file. */
  aliasEmailMap?: Record<string, string>;
  /**
   * Create member records for dues rows that don't match anyone (so the ledger
   * is complete). `newMember` rows are created as NEW_MEMBER, the rest as ACTIVE.
   * These have no email / Google login until an administrator links one.
   */
  createUnmatchedMembers?: boolean;
}

export interface DuesImportReport {
  dryRun: boolean;
  year: number;
  periodsEnsured: number;
  matched: { name: string; member: string; memberCode: string; score: number }[];
  ambiguous: { name: string; best: string; runnerUp: string | null }[];
  unmatched: { name: string; note?: string }[];
  createdMembers: { name: string; memberCode: string }[];
  assignmentsWritten: number;
  paymentsWritten: number;
  totals: { expected: number; collected: number };
}

type Candidate = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string | null;
};

@Injectable()
export class DuesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private describe(c: Candidate): string[] {
    const names = [`${c.firstName} ${c.lastName}`, `${c.lastName} ${c.firstName}`];
    if (c.preferredName) names.push(`${c.preferredName} ${c.lastName}`);
    return names;
  }

  async importMatrix(input: DuesMatrixImport, actorUserId: string, apply: boolean): Promise<DuesImportReport> {
    const year = Number(input.year);
    if (!Number.isInteger(year) || year < 2015 || year > 2100) throw new BadRequestException('Invalid year');
    if (!Array.isArray(input.rows) || input.rows.length === 0) throw new BadRequestException('No rows to import');
    const dueDay = Math.min(28, Math.max(1, Number(input.dueDayOfMonth) || 10));
    const defaultAmount = Number(input.defaultAmount) > 0 ? Number(input.defaultAmount) : 2000;
    const aliasMap = input.aliasEmailMap ?? {};

    const members = (await this.prisma.member.findMany({
      select: { id: true, firstName: true, lastName: true, preferredName: true, approvedMember: { select: { normalizedEmail: true } } },
    })).map<Candidate>((m) => ({
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      preferredName: m.preferredName,
      email: m.approvedMember?.normalizedEmail ?? null,
    }));
    const byEmail = new Map(members.filter((m) => m.email).map((m) => [m.email!, m]));

    const report: DuesImportReport = {
      dryRun: !apply,
      year,
      periodsEnsured: 0,
      matched: [],
      ambiguous: [],
      unmatched: [],
      createdMembers: [],
      assignmentsWritten: 0,
      paymentsWritten: 0,
      totals: { expected: 0, collected: 0 },
    };

    // Resolve each row to a member id (or mark for creation / unmatched).
    interface Resolved {
      row: DuesMatrixRow;
      memberId: string | null;
      create: boolean;
      names: { first: string; last: string };
    }
    const resolved: Resolved[] = [];
    for (const row of input.rows) {
      const key = normalizeNameTokens(row.name).join(' ');
      const viaAlias = aliasMap[key] ? byEmail.get(aliasMap[key].toLowerCase()) : undefined;
      let memberId: string | null = viaAlias?.id ?? null;

      if (!memberId) {
        const m = bestNameMatch(row.name, members, (c) => this.describe(c));
        if (m.match && !m.ambiguous) {
          memberId = m.match.id;
          report.matched.push({ name: row.name, member: `${m.match.firstName} ${m.match.lastName}`, memberCode: '', score: Math.round(m.score * 100) / 100 });
        } else if (m.match && m.ambiguous) {
          report.ambiguous.push({
            name: row.name,
            best: `${m.match.firstName} ${m.match.lastName}`,
            runnerUp: m.runnerUp ? `${(m.runnerUp.item as Candidate).firstName} ${(m.runnerUp.item as Candidate).lastName}` : null,
          });
        }
      } else {
        report.matched.push({ name: row.name, member: `${viaAlias!.firstName} ${viaAlias!.lastName}`, memberCode: '', score: 1 });
      }

      const tokens = normalizeNameTokens(row.name);
      const names = { first: tokens[0] ? cap(tokens[0]) : row.name, last: tokens.slice(1).map(cap).join(' ') || cap(tokens[0] ?? 'Member') };

      if (!memberId && input.createUnmatchedMembers) {
        resolved.push({ row, memberId: null, create: true, names });
      } else if (!memberId) {
        report.unmatched.push({ name: row.name, note: row.note });
      } else {
        resolved.push({ row, memberId, create: false, names });
      }
    }

    const work = async (tx: Prisma.TransactionClient) => {
      // 12 periods for the year.
      const periodIds: string[] = [];
      for (let month = 1; month <= 12; month++) {
        const period = await tx.duesPeriod.upsert({
          where: { year_month: { year, month } },
          update: {},
          create: {
            year,
            month,
            label: `${MONTHS[month - 1]} ${year}`,
            defaultAmount,
            dueDate: new Date(Date.UTC(year, month - 1, dueDay)),
            createdByUserId: actorUserId,
          },
        });
        periodIds.push(period.id);
        report.periodsEnsured++;
      }

      for (const item of resolved) {
        let memberId = item.memberId;
        if (item.create) {
          const code = `TFHC-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
          const created = await tx.member.create({
            data: {
              memberCode: code,
              firstName: item.names.first,
              lastName: item.names.last,
              phoneNumber: 'UNVERIFIED',
              roleInUnit: 'Member',
              status: item.row.newMember ? 'NEW_MEMBER' : 'ACTIVE',
            },
          });
          memberId = created.id;
          report.createdMembers.push({ name: item.row.name, memberCode: code });
        }
        if (!memberId) continue;

        const amount = Number(item.row.amount) > 0 ? Number(item.row.amount) : defaultAmount;
        const paid = new Set(item.row.paidMonths ?? []);
        const waived = new Set(item.row.waivedMonths ?? []);

        // Idempotency: clear this member's imported payments + assignments for the year.
        await tx.payment.deleteMany({
          where: { memberId, duesAssignment: { periodId: { in: periodIds } }, metadata: { path: ['imported'], equals: true } },
        });

        for (let month = 1; month <= 12; month++) {
          const periodId = periodIds[month - 1];
          const isPaid = paid.has(month);
          const isWaived = waived.has(month);
          const status = isPaid ? 'PAID' : isWaived ? 'WAIVED' : 'OUTSTANDING';

          const assignment = await tx.memberDuesAssignment.upsert({
            where: { periodId_memberId: { periodId, memberId } },
            update: { amountDue: amount, amountPaid: isPaid ? amount : 0, status, note: item.row.note ?? null },
            create: { periodId, memberId, amountDue: amount, amountPaid: isPaid ? amount : 0, status, note: item.row.note ?? null },
          });
          report.assignmentsWritten++;
          if (!isWaived) report.totals.expected += amount;

          if (isPaid) {
            const paidOn = new Date(Date.UTC(year, month - 1, dueDay));
            await tx.payment.create({
              data: {
                reference: makeReference('PMT', paidOn),
                memberId,
                purpose: 'MONTHLY_DUES',
                amount,
                method: 'OTHER',
                description: `${MONTHS[month - 1]} ${year} dues (imported from records)`,
                paidOn,
                status: 'CONFIRMED',
                duesAssignmentId: assignment.id,
                recordedByUserId: actorUserId,
                confirmedByUserId: actorUserId,
                confirmedAt: new Date(),
                metadata: { imported: true, source: 'dues-matrix', year, month },
              },
            });
            report.paymentsWritten++;
            report.totals.collected += amount;
          }
        }
      }
    };

    if (apply) {
      await this.prisma.$transaction(work, { timeout: 180000 });
      await this.audit.record({
        actorUserId,
        action: 'DUES_MATRIX_IMPORTED',
        entity: 'DuesPeriod',
        entityId: String(year),
        newData: {
          matched: report.matched.length,
          unmatched: report.unmatched.length,
          payments: report.paymentsWritten,
          collected: report.totals.collected,
        },
      });
    } else {
      await this.prisma
        .$transaction(async (tx) => {
          await work(tx);
          throw new DryRunRollback();
        })
        .catch((e) => {
          if (!(e instanceof DryRunRollback)) throw e;
        });
    }

    report.totals.expected = Math.round(report.totals.expected * 100) / 100;
    report.totals.collected = Math.round(report.totals.collected * 100) / 100;
    return report;
  }
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
class DryRunRollback extends Error {}
