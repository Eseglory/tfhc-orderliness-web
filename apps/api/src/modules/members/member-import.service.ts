import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { parseYearlessBirthday } from '@tfhc/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/rbac/audit.service';

export interface DirectoryRow {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  birthday?: string;
  profession?: string;
  aliases?: string[];
}

export interface DirectoryImportReport {
  dryRun: boolean;
  total: number;
  created: { email: string; name: string }[];
  updated: { email: string; name: string; changed: string[] }[];
  unchanged: { email: string; name: string }[];
  linkedExistingUser: { email: string }[];
  errors: { email: string; message: string }[];
}

@Injectable()
export class MemberImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private clean(row: DirectoryRow) {
    const email = (row.email || '').trim().toLowerCase();
    const firstName = (row.firstName || '').trim();
    const lastName = (row.lastName || '').trim();
    const phoneNumber = (row.phoneNumber || '').replace(/[^+0-9]/g, '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Invalid email');
    if (firstName.length < 2 || lastName.length < 2) throw new BadRequestException('First and last name are required');
    if (phoneNumber.replace(/\D/g, '').length < 7) throw new BadRequestException('A phone number is required');
    const birthday = row.birthday ? parseYearlessBirthday(row.birthday) : null;
    return {
      email,
      profile: {
        firstName,
        lastName,
        phoneNumber,
        birthday,
        profession: row.profession?.trim() || null,
      },
    };
  }

  private async uniqueMemberCode(tx: Prisma.TransactionClient): Promise<string> {
    for (let i = 0; i < 12; i++) {
      const code = `TFHC-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      if (!(await tx.member.findUnique({ where: { memberCode: code } }))) return code;
    }
    throw new BadRequestException('Could not allocate a member code');
  }

  async importDirectory(rows: DirectoryRow[], actorUserId: string, apply: boolean): Promise<DirectoryImportReport> {
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('No rows to import');
    if (rows.length > 2000) throw new BadRequestException('Too many rows in one import');

    const report: DirectoryImportReport = {
      dryRun: !apply,
      total: rows.length,
      created: [],
      updated: [],
      unchanged: [],
      linkedExistingUser: [],
      errors: [],
    };

    const parsed: { email: string; profile: ReturnType<MemberImportService['clean']>['profile'] }[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      try {
        const c = this.clean(row);
        if (seen.has(c.email)) {
          report.errors.push({ email: c.email, message: 'Duplicate email in the import file' });
          continue;
        }
        seen.add(c.email);
        parsed.push(c);
      } catch (e) {
        report.errors.push({ email: (row.email || '').toLowerCase(), message: (e as Error).message });
      }
    }

    const run = async (tx: Prisma.TransactionClient) => {
      for (const { email, profile } of parsed) {
        const name = `${profile.firstName} ${profile.lastName}`;
        const approved = await tx.approvedMember.findUnique({ where: { normalizedEmail: email }, include: { member: true } });

        if (approved?.member) {
          const before = approved.member;
          const changed = (['firstName', 'lastName', 'phoneNumber', 'birthday', 'profession'] as const).filter(
            (k) => (before[k] ?? null) !== (profile[k] ?? null),
          );
          if (changed.length === 0) {
            report.unchanged.push({ email, name });
            continue;
          }
          if (apply) await tx.member.update({ where: { id: before.id }, data: profile });
          report.updated.push({ email, name, changed });
          continue;
        }

        // No linked approved member yet.
        const existingUser = await tx.user.findUnique({ where: { email }, include: { member: true } });
        if (existingUser?.member) {
          // A login account already owns a member record — attach the approval + refresh the profile.
          if (apply) {
            await tx.approvedMember.upsert({
              where: { normalizedEmail: email },
              update: { memberId: existingUser.member.id, status: 'ACTIVE' },
              create: { email, normalizedEmail: email, status: 'ACTIVE', source: 'DIRECTORY_IMPORT', memberId: existingUser.member.id, importedBy: actorUserId, importedAt: new Date() },
            });
            await tx.member.update({ where: { id: existingUser.member.id }, data: profile });
          }
          report.linkedExistingUser.push({ email });
          report.updated.push({ email, name, changed: ['linked'] });
          continue;
        }

        if (apply) {
          const memberCode = await this.uniqueMemberCode(tx);
          const member = await tx.member.create({
            data: { memberCode, roleInUnit: 'Member', status: 'ACTIVE', ...profile },
          });
          await tx.approvedMember.upsert({
            where: { normalizedEmail: email },
            update: { memberId: member.id, status: 'ACTIVE' },
            create: { email, normalizedEmail: email, status: 'ACTIVE', source: 'DIRECTORY_IMPORT', memberId: member.id, importedBy: actorUserId, importedAt: new Date() },
          });
          if (existingUser && !existingUser.member) {
            await tx.member.update({ where: { id: member.id }, data: { userId: existingUser.id } });
          }
        }
        report.created.push({ email, name });
      }
    };

    if (apply) {
      await this.prisma.$transaction(run, { timeout: 120000 });
      await this.audit.record({
        actorUserId,
        action: 'MEMBER_DIRECTORY_IMPORTED',
        entity: 'Member',
        entityId: 'directory',
        newData: { created: report.created.length, updated: report.updated.length, errors: report.errors.length },
      });
    } else {
      await this.prisma.$transaction(async (tx) => {
        await run(tx);
        throw new DryRunRollback();
      }).catch((e) => {
        if (!(e instanceof DryRunRollback)) throw e;
      });
    }

    return report;
  }
}

class DryRunRollback extends Error {}
