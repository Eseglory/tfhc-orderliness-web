import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { DEFAULT_EVENT_TYPES, Role, toPascalCase } from '@tfhc/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/rbac/audit.service';
import { MailService } from '../mail/mail.service';
import { renderInvitationEmail } from '../mail/templates';
import { hashInviteToken } from '../../common/invite-token';
import { webBaseUrl } from '../../common/web-url';
import { settleWithin } from '../../common/settle-within';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INVITE_EMAIL_TIMEOUT_MS = 8000;

export type LookupKind = 'event-types' | 'meeting-categories' | 'sub-teams' | 'approved-members';

export interface LookupRow {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  isSystem: boolean;
  inUse: number;
  deletable: boolean;
  extra: Record<string, unknown>;
}

export type CandidateAccountStatus = 'NOT_REGISTERED' | 'REGISTERED_PASSWORD' | 'REGISTERED_GOOGLE';
export type CandidateInviteStatus = 'NOT_INVITED' | 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'FAILED' | 'REVOKED';

export function computeApprovedMemberAccountStatus(approved: {
  member?: {
    user?: {
      id: string;
      isActive: boolean;
      inviteTokenHash?: string | null;
      emailVerifiedAt?: Date | null;
      googleSubject?: string | null;
      passwordAuthEnabled?: boolean;
    } | null;
  } | null;
}): CandidateAccountStatus {
  const user = approved.member?.user;
  if (!user || user.inviteTokenHash) return 'NOT_REGISTERED';
  if (user.googleSubject && !user.passwordAuthEnabled) return 'REGISTERED_GOOGLE';
  if (user.passwordAuthEnabled || user.emailVerifiedAt) return 'REGISTERED_PASSWORD';
  return 'NOT_REGISTERED';
}

export function computeApprovedMemberInviteStatus(
  approved: {
    status: string;
    inviteStatus?: string | null;
    inviteTokenHash?: string | null;
    inviteExpiresAt?: Date | null;
    member?: {
      user?: {
        id: string;
        isActive: boolean;
        inviteTokenHash?: string | null;
        inviteExpiresAt?: Date | null;
        emailVerifiedAt?: Date | null;
        googleSubject?: string | null;
        passwordAuthEnabled?: boolean;
      } | null;
    } | null;
  }
): CandidateInviteStatus {
  if (approved.status === 'REVOKED') return 'REVOKED';
  const user = approved.member?.user;
  if (user && user.isActive && !user.inviteTokenHash && (user.emailVerifiedAt || user.googleSubject || user.passwordAuthEnabled)) {
    return 'ACCEPTED';
  }
  if (approved.inviteTokenHash && approved.inviteExpiresAt) {
    if (approved.inviteExpiresAt.getTime() > Date.now()) {
      return 'PENDING';
    } else {
      return 'EXPIRED';
    }
  }
  if (user && user.inviteTokenHash && user.inviteExpiresAt) {
    if (user.inviteExpiresAt.getTime() > Date.now()) {
      return 'PENDING';
    } else {
      return 'EXPIRED';
    }
  }
  if (approved.inviteStatus === 'FAILED') return 'FAILED';
  return 'NOT_INVITED';
}

@Injectable()
export class LookupsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LookupsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private webBaseUrl(): string {
    return webBaseUrl(this.config);
  }

  private async sendMemberInviteEmail(
    email: string,
    firstName: string,
    inviteUrl: string,
    inviter?: { name?: string; title?: string; email?: string },
  ): Promise<boolean> {
    const { subject, text, html } = renderInvitationEmail({
      recipientName: firstName,
      recipientEmail: email,
      inviteUrl,
      inviterName: inviter?.name,
      inviterTitle: inviter?.title,
      inviterEmail: inviter?.email,
      orientationNotice: {
        title: 'Platform Member Activation Notice',
        description: 'You have been invited to become an active member on the TFHC Orderliness Platform. Click below to activate your account.',
      },
    });
    try {
      await this.mail.sendEmail({ to: email, subject, text, html });
      return true;
    } catch (error) {
      this.logger.warn(`Member invite email to ${email} failed: ${(error as Error).message}`);
      return false;
    }
  }


  async onApplicationBootstrap() {
    try {
      await this.syncSystemEventTypes();
      await this.syncSystemSubTeams();
    } catch (error) {
      this.logger.error('Lookups sync failed at boot', error as Error);
    }
  }

  /** Ensure default system sub-teams (including Disciplinary Committee and Executive) exist */
  async syncSystemSubTeams() {
    const subTeams = [
      { name: 'Executive', description: 'Executive and leadership council' },
      { name: 'Disciplinary Committee', description: 'Disciplinary and ethics committee of the church' },
      { name: 'Protocol', description: 'Protocol and orderliness unit' },
      { name: 'Media & IT', description: 'Technical, sound, and media broadcast unit' },
      { name: 'Choir', description: 'Worship and music ministry' },
      { name: 'Ushering', description: 'Hospitality and ushering team' },
      { name: 'Security', description: 'Facility safety and security team' },
    ];

    for (const st of subTeams) {
      await this.prisma.subTeam.upsert({
        where: { name: st.name },
        update: { isSystem: true, active: true },
        create: { name: st.name, description: st.description, isSystem: true, active: true },
      });
    }

    // Auto-assign requested Disciplinary Committee members if they exist
    const disciplinaryGroup = await this.prisma.subTeam.findUnique({
      where: { name: 'Disciplinary Committee' },
    });

    if (disciplinaryGroup) {
      const targetEmails = [
        'nicoleokafor0@gmail.com',
        'dotunakingbesote@gmail.com',
        'onojamonday123@gmail.com',
      ];
      await this.prisma.member.updateMany({
        where: {
          OR: [
            { approvedMember: { email: { in: targetEmails } } },
            { firstName: 'Nicole', lastName: 'Okafor' },
            { firstName: { in: ['Adedotun', 'Adedorun'] } },
            { firstName: 'Jacob', lastName: 'Onoja' },
          ],
        },
        data: {
          subTeamId: disciplinaryGroup.id,
        },
      });
    }
  }

  /** Ensure every system event type from the shared catalogue exists. Never
   *  overwrites admin edits to name/colour/order; only fills gaps. */
  async syncSystemEventTypes() {
    await Promise.all(
      DEFAULT_EVENT_TYPES.map((def, i) =>
        this.prisma.eventType.upsert({
          where: { key: def.key },
          update: { isSystem: true },
          create: {
            key: def.key,
            name: def.name,
            description: def.description,
            icon: def.icon,
            color: def.color,
            defaultCompulsory: def.defaultCompulsory,
            isSystem: true,
            sortOrder: (i + 1) * 10,
          },
        })
      )
    );
  }

  private slug(name: string): string {
    return (
      name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'ITEM'
    );
  }

  async list(kind: LookupKind, includeInactive = false) {
    switch (kind) {
      case 'event-types': {
        const rows = await this.prisma.eventType.findMany({
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          where: includeInactive ? {} : { active: true },
          include: { _count: { select: { meetings: true } } },
        });
        return rows.map<LookupRow>((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          active: r.active,
          isSystem: r.isSystem,
          inUse: r._count.meetings,
          deletable: !r.isSystem && r._count.meetings === 0,
          extra: { key: r.key, icon: r.icon, color: r.color, defaultCompulsory: r.defaultCompulsory, sortOrder: r.sortOrder },
        }));
      }
      case 'meeting-categories': {
        const rows = await this.prisma.meetingCategory.findMany({
          orderBy: { name: 'asc' },
          where: includeInactive ? {} : { active: true },
          include: { _count: { select: { meetings: true } } },
        });
        return rows.map<LookupRow>((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          active: r.active,
          isSystem: r.isSystem,
          inUse: r._count.meetings,
          deletable: !r.isSystem && r._count.meetings === 0,
          extra: { basePoints: r.basePoints, pointWeight: r.pointWeight },
        }));
      }
      case 'sub-teams': {
        const rows = await this.prisma.subTeam.findMany({
          orderBy: { name: 'asc' },
          where: includeInactive ? {} : { active: true },
          include: { _count: { select: { members: true } } },
        });
        return rows.map<LookupRow>((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          active: r.active,
          isSystem: r.isSystem,
          inUse: r._count.members,
          deletable: !r.isSystem && r._count.members === 0,
          extra: {},
        }));
      }
      default:
        throw new BadRequestException('Unknown lookup');
    }
  }

  private num(value: unknown, field: string, min: number, max: number): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) throw new BadRequestException(`${field} must be between ${min} and ${max}`);
    return n;
  }

  async create(kind: LookupKind, dto: Record<string, unknown>, actorUserId: string) {
    const name = typeof dto.name === 'string' ? dto.name.trim() : '';
    if (name.length < 2 || name.length > 80) throw new BadRequestException('Name must be 2–80 characters');
    const description = typeof dto.description === 'string' && dto.description.trim() ? dto.description.trim() : null;

    let created: { id: string };
    if (kind === 'event-types') {
      let key = this.slug(name);
      for (let i = 0; await this.prisma.eventType.findUnique({ where: { key } }); i++) key = `${this.slug(name)}_${i + 2}`;
      created = await this.prisma.eventType.create({
        data: {
          key,
          name,
          description,
          icon: typeof dto.icon === 'string' ? dto.icon.slice(0, 40) : 'event',
          color: typeof dto.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(dto.color) ? dto.color : '#64748B',
          defaultCompulsory: Boolean(dto.defaultCompulsory),
          sortOrder: this.num(dto.sortOrder, 'Sort order', 0, 9999) ?? 500,
          createdById: actorUserId,
        },
      });
    } else if (kind === 'meeting-categories') {
      const clash = await this.prisma.meetingCategory.findUnique({ where: { name } });
      if (clash) throw new ConflictException('A category with this name already exists');
      created = await this.prisma.meetingCategory.create({
        data: {
          name,
          description,
          basePoints: this.num(dto.basePoints, 'Base points', 0, 1000) ?? 10,
          pointWeight: this.num(dto.pointWeight, 'Point weight', 0, 100) ?? 1,
        },
      });
    } else {
      const clash = await this.prisma.subTeam.findUnique({ where: { name } });
      if (clash) throw new ConflictException('A sub-team with this name already exists');
      created = await this.prisma.subTeam.create({ data: { name, description } });
    }

    await this.audit.record({
      actorUserId,
      action: 'LOOKUP_CREATED',
      entity: 'Lookup',
      entityId: created.id,
      newData: { kind, name },
    });
    return this.findOne(kind, created.id);
  }

  async update(kind: LookupKind, id: string, dto: Record<string, unknown>, actorUserId: string) {
    const before = await this.findOne(kind, id);
    const data: Record<string, unknown> = {};
    if (typeof dto.name === 'string') {
      const name = dto.name.trim();
      if (name.length < 2 || name.length > 80) throw new BadRequestException('Name must be 2–80 characters');
      data.name = name;
    }
    if (dto.description !== undefined)
      data.description = typeof dto.description === 'string' && dto.description.trim() ? dto.description.trim() : null;
    if (dto.active !== undefined) {
      if (before.isSystem && dto.active === false && kind === 'event-types') {
        // Allowed — deactivating a system type is fine; deleting is not.
      }
      data.active = Boolean(dto.active);
    }

    if (kind === 'event-types') {
      if (dto.icon !== undefined) data.icon = typeof dto.icon === 'string' ? dto.icon.slice(0, 40) : null;
      if (dto.color !== undefined && typeof dto.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(dto.color)) data.color = dto.color;
      if (dto.defaultCompulsory !== undefined) data.defaultCompulsory = Boolean(dto.defaultCompulsory);
      const so = this.num(dto.sortOrder, 'Sort order', 0, 9999);
      if (so !== undefined) data.sortOrder = so;
      await this.prisma.eventType.update({ where: { id }, data });
    } else if (kind === 'meeting-categories') {
      const bp = this.num(dto.basePoints, 'Base points', 0, 1000);
      const pw = this.num(dto.pointWeight, 'Point weight', 0, 100);
      if (bp !== undefined) data.basePoints = bp;
      if (pw !== undefined) data.pointWeight = pw;
      await this.prisma.meetingCategory.update({ where: { id }, data });
    } else {
      await this.prisma.subTeam.update({ where: { id }, data });
    }

    await this.audit.record({
      actorUserId,
      action: 'LOOKUP_UPDATED',
      entity: 'Lookup',
      entityId: id,
      previousData: { kind, name: before.name, active: before.active },
      newData: { kind, ...data },
    });
    return this.findOne(kind, id);
  }

  async remove(kind: LookupKind, id: string, actorUserId: string) {
    const row = await this.findOne(kind, id);
    if (row.isSystem) throw new ForbiddenException('System entries cannot be deleted — deactivate it instead');
    if (row.inUse > 0)
      throw new ConflictException(`This entry is used by ${row.inUse} record(s). Reassign them, or deactivate it instead.`);

    if (kind === 'event-types') await this.prisma.eventType.delete({ where: { id } });
    else if (kind === 'meeting-categories') await this.prisma.meetingCategory.delete({ where: { id } });
    else await this.prisma.subTeam.delete({ where: { id } });

    await this.audit.record({
      actorUserId,
      action: 'LOOKUP_DELETED',
      entity: 'Lookup',
      entityId: id,
      previousData: { kind, name: row.name },
    });
    return { deleted: true };
  }

  private async findOne(kind: LookupKind, id: string): Promise<LookupRow> {
    const rows = await this.list(kind, true);
    const row = rows.find((r) => r.id === id);
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  // =========================================================================
  // MEMBER LOOKUP TABLE & INVITATIONS
  // =========================================================================

  async listApprovedMembers(query?: {
    search?: string;
    inviteStatus?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(query?.page ?? 1));
    const pageSize = Math.min(500, Math.max(1, Number(query?.pageSize ?? 50)));
    const search = (query?.search ?? '').trim().toLowerCase();
    const inviteStatusFilter = query?.inviteStatus?.toUpperCase();

    const whereClause: Prisma.ApprovedMemberWhereInput = {};
    if (search) {
      whereClause.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { normalizedEmail: { contains: search, mode: 'insensitive' } },
        { member: { firstName: { contains: search, mode: 'insensitive' } } },
        { member: { lastName: { contains: search, mode: 'insensitive' } } },
        { member: { memberCode: { contains: search, mode: 'insensitive' } } },
        { member: { phoneNumber: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const rows = await this.prisma.approvedMember.findMany({
      where: whereClause,
      orderBy: [{ createdAt: 'desc' }],
      include: {
        member: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                isActive: true,
                inviteTokenHash: true,
                inviteExpiresAt: true,
                emailVerifiedAt: true,
                googleSubject: true,
                passwordAuthEnabled: true,
              },
            },
          },
        },
      },
    });

    const formatted = rows.map((r) => {
      const computedStatus = computeApprovedMemberInviteStatus(r);
      const accountStatus = computeApprovedMemberAccountStatus(r);
      const isEligible = r.status === 'ACTIVE' && computedStatus !== 'ACCEPTED' && computedStatus !== 'PENDING';
      return {
        id: r.id,
        email: r.email,
        normalizedEmail: r.normalizedEmail,
        status: r.status,
        lookupStatus: r.status === 'ACTIVE' ? 'FOUND' : 'REVOKED',
        accountStatus,
        isEligible,
        source: r.source,
        importedAt: r.importedAt,
        importedBy: r.importedBy,
        memberId: r.memberId,
        member: r.member
          ? {
              id: r.member.id,
              memberCode: r.member.memberCode,
              firstName: r.member.firstName,
              lastName: r.member.lastName,
              phoneNumber: r.member.phoneNumber,
              roleInUnit: r.member.roleInUnit,
              status: r.member.status,
              user: r.member.user
                ? {
                    id: r.member.user.id,
                    email: r.member.user.email,
                    isActive: r.member.user.isActive,
                    isRegistered: Boolean(
                      r.member.user.emailVerifiedAt ||
                        r.member.user.googleSubject ||
                        r.member.user.passwordAuthEnabled,
                    ),
                  }
                : null,
            }
          : null,
        invitedAt: r.invitedAt,
        invitedById: r.invitedById,
        inviteExpiresAt: r.inviteExpiresAt,
        inviteStatus: computedStatus,
        inviteError: r.inviteError,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    });

    const filtered =
      inviteStatusFilter && inviteStatusFilter !== 'ALL'
        ? formatted.filter((r) => {
            if (inviteStatusFilter === 'ELIGIBLE') return r.isEligible;
            return r.inviteStatus === inviteStatusFilter;
          })
        : formatted;

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    const stats = {
      total: formatted.length,
      eligible: formatted.filter((f) => f.isEligible).length,
      notInvited: formatted.filter((f) => f.inviteStatus === 'NOT_INVITED').length,
      pending: formatted.filter((f) => f.inviteStatus === 'PENDING').length,
      accepted: formatted.filter((f) => f.inviteStatus === 'ACCEPTED').length,
      expired: formatted.filter((f) => f.inviteStatus === 'EXPIRED').length,
      revoked: formatted.filter((f) => f.inviteStatus === 'REVOKED').length,
      failed: formatted.filter((f) => f.inviteStatus === 'FAILED').length,
    };

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
      stats,
    };
  }

  async inviteOneApprovedMember(id: string, actorUserId: string, resend = false) {
    const approved = await this.prisma.approvedMember.findUnique({
      where: { id },
      include: { member: { include: { user: true } } },
    });

    if (!approved) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'LOOKUP_RECORD_NOT_FOUND',
        message: 'This person is not in the church member lookup table and is not eligible for invitation.',
      });
    }
    if (approved.status !== 'ACTIVE') {
      throw new BadRequestException({
        statusCode: 400,
        code: 'LOOKUP_RECORD_REVOKED',
        message: 'This lookup record is deactivated or revoked. Only active lookup members can be invited.',
      });
    }

    const currentStatus = computeApprovedMemberInviteStatus(approved);

    if (currentStatus === 'ACCEPTED') {
      return {
        id: approved.id,
        email: approved.email,
        name: approved.member ? `${approved.member.firstName} ${approved.member.lastName}` : approved.email,
        status: 'ALREADY_MEMBER' as const,
        message: 'Person is already an active registered platform member.',
      };
    }

    if (currentStatus === 'PENDING' && !resend) {
      return {
        id: approved.id,
        email: approved.email,
        name: approved.member ? `${approved.member.firstName} ${approved.member.lastName}` : approved.email,
        status: 'ALREADY_PENDING' as const,
        message: 'An active invitation is already pending for this lookup member.',
      };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashInviteToken(rawToken);
    const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);

    try {
      await this.prisma.$transaction(async (tx) => {
        let member = approved.member;
        if (!member) {
          const memberCode = `TFHC-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
          const emailPrefix = approved.email.split('@')[0].replace(/[0-9._-]+/g, ' ');
          const firstName = toPascalCase(emailPrefix || 'Member');
          member = await tx.member.create({
            data: {
              memberCode,
              firstName,
              lastName: '',
              phoneNumber: '',
              roleInUnit: 'Member',
              status: 'ACTIVE',
            },
            include: { user: true },
          });
          await tx.approvedMember.update({
            where: { id: approved.id },
            data: { memberId: member.id },
          });
        }

        const existingUser = member.user || (await tx.user.findUnique({ where: { email: approved.normalizedEmail } }));
        let user: { id: string };
        if (existingUser) {
          user = await tx.user.update({
            where: { id: existingUser.id },
            data: {
              role: Role.MEMBER,
              isActive: false,
              invitedById: actorUserId,
              invitedAt: new Date(),
              inviteTokenHash: tokenHash,
              inviteExpiresAt: inviteExpiresAt,
            },
          });
        } else {
          user = await tx.user.create({
            data: {
              email: approved.normalizedEmail,
              passwordHash: await argon2.hash(crypto.randomUUID()),
              role: Role.MEMBER,
              isActive: false,
              invitedById: actorUserId,
              invitedAt: new Date(),
              inviteTokenHash: tokenHash,
              inviteExpiresAt: inviteExpiresAt,
              passwordAuthEnabled: false,
            },
          });
        }

        if (member.userId !== user.id) {
          await tx.member.update({ where: { id: member.id }, data: { userId: user.id } });
        }

        await tx.approvedMember.update({
          where: { id: approved.id },
          data: {
            invitedAt: new Date(),
            invitedById: actorUserId,
            inviteTokenHash: tokenHash,
            inviteExpiresAt: inviteExpiresAt,
            inviteStatus: 'PENDING',
            inviteError: null,
          },
        });

        await this.audit.recordWithin(tx, {
          actorUserId,
          action: 'MEMBER_LOOKUP_INVITED',
          entity: 'ApprovedMember',
          entityId: approved.id,
          newData: { email: approved.email, inviteStatus: 'PENDING' },
        });
      });

      const actor = await this.prisma.user.findUnique({
        where: { id: actorUserId },
        include: { member: true },
      });
      const inviter = actor
        ? {
            name: actor.member ? `${actor.member.firstName} ${actor.member.lastName}` : undefined,
            title: 'System Administrator',
            email: actor.email,
          }
        : undefined;

      const inviteUrl = `${this.webBaseUrl()}/accept-invite?token=${rawToken}`;
      const recipientName = approved.member?.firstName || approved.email.split('@')[0];
      const emailDelivered = await settleWithin(
        this.sendMemberInviteEmail(approved.email, recipientName, inviteUrl, inviter),
        INVITE_EMAIL_TIMEOUT_MS,
        false,
      );

      if (!emailDelivered) {
        this.logger.warn(`Member invite email to ${approved.email} could not be delivered`);
      }

      return {
        id: approved.id,
        email: approved.email,
        name: approved.member ? `${approved.member.firstName} ${approved.member.lastName}` : approved.email,
        status: 'INVITED' as const,
        emailDelivered,
        inviteUrl: !emailDelivered || this.config.get('NODE_ENV') !== 'production' ? inviteUrl : undefined,
      };
    } catch (err: any) {
      this.logger.error(`Failed to invite lookup record ${id}: ${err.message}`);
      await this.prisma.approvedMember.update({
        where: { id: approved.id },
        data: { inviteStatus: 'FAILED', inviteError: err.message },
      }).catch(() => undefined);

      return {
        id: approved.id,
        email: approved.email,
        name: approved.member ? `${approved.member.firstName} ${approved.member.lastName}` : approved.email,
        status: 'FAILED' as const,
        message: err.message || 'Invitation processing failed.',
      };
    }
  }

  async inviteSelectedApprovedMembers(ids: string[], actorUserId: string) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('No lookup table records selected');
    }
    if (ids.length > 500) {
      throw new BadRequestException('Cannot select more than 500 records in one request');
    }

    const results: Array<{
      id: string;
      email?: string;
      name?: string;
      status: 'INVITED' | 'ALREADY_MEMBER' | 'ALREADY_PENDING' | 'INVALID' | 'FAILED';
      message?: string;
      emailDelivered?: boolean;
      inviteUrl?: string;
    }> = [];

    let invitedCount = 0;
    let alreadyMemberCount = 0;
    let alreadyPendingCount = 0;
    let invalidCount = 0;
    let failedCount = 0;

    for (const id of ids) {
      try {
        const res = await this.inviteOneApprovedMember(id, actorUserId);
        if (res.status === 'INVITED') invitedCount++;
        else if (res.status === 'ALREADY_MEMBER') alreadyMemberCount++;
        else if (res.status === 'ALREADY_PENDING') alreadyPendingCount++;
        else if (res.status === 'FAILED') failedCount++;
        else invalidCount++;
        results.push(res);
      } catch (err: any) {
        if (err instanceof NotFoundException || err?.response?.code === 'LOOKUP_RECORD_NOT_FOUND' || err?.status === 404 || err?.status === 400) {
          invalidCount++;
          results.push({
            id,
            status: 'INVALID',
            message: err.message || 'Lookup record not found or not eligible',
          });
        } else {
          failedCount++;
          results.push({
            id,
            status: 'FAILED',
            message: err.message || 'Processing failed',
          });
        }
      }
    }

    return {
      total: ids.length,
      invitedCount,
      alreadyMemberCount,
      alreadyPendingCount,
      invalidCount,
      failedCount,
      results,
    };
  }

  async inviteAllEligibleApprovedMembers(actorUserId: string) {
    const allApproved = await this.prisma.approvedMember.findMany({
      where: { status: 'ACTIVE' },
      include: { member: { include: { user: true } } },
    });

    const eligibleIds: string[] = [];
    let skippedAlreadyMember = 0;
    let skippedAlreadyPending = 0;

    for (const record of allApproved) {
      const status = computeApprovedMemberInviteStatus(record);
      if (status === 'ACCEPTED') {
        skippedAlreadyMember++;
      } else if (status === 'PENDING') {
        skippedAlreadyPending++;
      } else {
        eligibleIds.push(record.id);
      }
    }

    if (eligibleIds.length === 0) {
      return {
        totalInLookupTable: allApproved.length,
        eligibleCount: 0,
        invitedCount: 0,
        alreadyMemberCount: skippedAlreadyMember,
        alreadyPendingCount: skippedAlreadyPending,
        invalidCount: 0,
        failedCount: 0,
        results: [],
        message: 'No eligible un-invited users found in the lookup table.',
      };
    }

    const batchResult = await this.inviteSelectedApprovedMembers(eligibleIds, actorUserId);

    return {
      totalInLookupTable: allApproved.length,
      eligibleCount: eligibleIds.length,
      ...batchResult,
    };
  }
}
