import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { Role, SYSTEM_ROLE } from '@tfhc/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/rbac/audit.service';
import { MailService } from '../mail/mail.service';
import { renderBrandedEmail } from '../mail/templates';
import { hashInviteToken } from '../../common/invite-token';
import { InviteAdminDto, UpdateAdminDto } from './admin-team.dto';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INVITE_EMAIL_TIMEOUT_MS = 8000;

/**
 * Resolve to the promise's value, or `fallback` if it takes longer than `ms`.
 * The slow promise is never left to reject unhandled — it is drained in the
 * background. Used so a stalled SMTP handshake can't hold an interactive
 * request open.
 */
function settleWithin<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  const guarded = promise.catch(() => fallback);
  return Promise.race([
    guarded,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

@Injectable()
export class AdminTeamService {
  private readonly logger = new Logger(AdminTeamService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private webBaseUrl(): string {
    const configured =
      this.config.get<string>('APP_WEB_URL') ||
      (this.config.get<string>('CORS_ORIGIN') || '').split(',')[0].trim();
    return (configured || 'http://localhost:3000').replace(/\/+$/, '');
  }

  private async generateMemberCode(tx: Prisma.TransactionClient): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = `TFHC-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
      const clash = await tx.member.findUnique({ where: { memberCode: code } });
      if (!clash) return code;
    }
    throw new ConflictException('Could not allocate a unique member code');
  }

  async list() {
    const users = await this.prisma.user.findMany({
      where: { role: { in: [Role.ADMIN, Role.LEADER] } },
      orderBy: { createdAt: 'asc' },
      include: {
        member: { select: { id: true, firstName: true, lastName: true, phoneNumber: true, profilePhotoUrl: true } },
        accessRoles: { include: { role: { select: { id: true, key: true, name: true } } } },
      },
    });

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.member?.firstName ?? null,
      lastName: u.member?.lastName ?? null,
      phoneNumber: u.member?.phoneNumber ?? null,
      photoUrl: u.member?.profilePhotoUrl ?? null,
      isActive: u.isActive,
      invitePending: Boolean(u.inviteTokenHash),
      inviteExpiresAt: u.inviteExpiresAt,
      invitedAt: u.invitedAt,
      inviteAcceptedAt: u.inviteAcceptedAt,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      roles: u.accessRoles.map((g) => g.role),
      isSuperAdmin: u.accessRoles.some((g) => g.role.key === SYSTEM_ROLE.SUPER_ADMIN),
    }));
  }

  private async assertRolesExist(roleIds: string[]) {
    const roles = await this.prisma.accessRole.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== roleIds.length) {
      throw new BadRequestException('One or more selected roles do not exist');
    }
    return roles;
  }

  /** Count active accounts (excluding `exceptUserId`) that still hold Super Admin. */
  private async otherActiveSuperAdmins(exceptUserId: string): Promise<number> {
    return this.prisma.user.count({
      where: {
        id: { not: exceptUserId },
        isActive: true,
        inviteTokenHash: null,
        accessRoles: { some: { role: { key: SYSTEM_ROLE.SUPER_ADMIN } } },
      },
    });
  }

  async invite(dto: InviteAdminDto, actorUserId: string) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const roles = await this.assertRolesExist(dto.roleIds);
    const rawToken = crypto.randomBytes(32).toString('hex');

    const user = await this.prisma.$transaction(async (tx) => {
      const memberCode = await this.generateMemberCode(tx);
      const created = await tx.user.create({
        data: {
          email,
          // Placeholder hash — replaced when the invite is accepted.
          passwordHash: await argon2.hash(crypto.randomUUID()),
          role: Role.ADMIN,
          isActive: false,
          invitedById: actorUserId,
          invitedAt: new Date(),
          inviteTokenHash: hashInviteToken(rawToken),
          inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
          member: {
            create: {
              memberCode,
              firstName: dto.firstName.trim(),
              lastName: dto.lastName.trim(),
              phoneNumber: dto.phoneNumber.trim(),
              roleInUnit: 'Administrator',
            },
          },
          accessRoles: {
            create: roles.map((r) => ({ roleId: r.id, assignedById: actorUserId })),
          },
        },
        include: { member: true, accessRoles: { include: { role: true } } },
      });
      await this.audit.recordWithin(tx, {
        actorUserId,
        action: 'ADMIN_INVITED',
        entity: 'User',
        entityId: created.id,
        newData: { email, roles: roles.map((r) => r.key) },
      });
      return created;
    });

    const inviteUrl = `${this.webBaseUrl()}/accept-invite?token=${rawToken}`;
    const emailDelivered = await settleWithin(
      this.sendInviteEmail(email, dto.firstName.trim(), inviteUrl),
      INVITE_EMAIL_TIMEOUT_MS,
      false,
    );

    return {
      id: user.id,
      email,
      emailDelivered,
      // Returned so the Super Admin can share the link manually when SMTP is down.
      inviteUrl: emailDelivered ? undefined : inviteUrl,
    };
  }

  private async sendInviteEmail(email: string, firstName: string, inviteUrl: string): Promise<boolean> {
    const { subject, text, html } = renderBrandedEmail({
      heading: 'You have been invited to TFHC Orderliness',
      preview: 'Set your password to activate your administrator account.',
      paragraphs: [
        `Hello ${firstName},`,
        'A Super Admin has created an administrator account for you on TFHC Orderliness.',
        'Click the button below to set your password and sign in.',
      ],
      cta: { label: 'Set your password', url: inviteUrl },
      footnote: 'This invitation link expires in 7 days. If it expires, ask a Super Admin to resend it.',
    });
    try {
      await this.mail.sendEmail({ to: email, subject, text, html });
      return true;
    } catch (error) {
      this.logger.warn(`Invite email to ${email} failed: ${(error as Error).message}`);
      return false;
    }
  }

  async resendInvite(userId: string, actorUserId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { member: true } });
    if (!user || !['ADMIN', 'LEADER'].includes(user.role)) throw new NotFoundException('Admin not found');
    if (!user.inviteTokenHash) throw new BadRequestException('This account has already been activated');

    const rawToken = crypto.randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        inviteTokenHash: hashInviteToken(rawToken),
        inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
        invitedAt: new Date(),
        invitedById: actorUserId,
      },
    });

    const inviteUrl = `${this.webBaseUrl()}/accept-invite?token=${rawToken}`;
    const emailDelivered = await settleWithin(
      this.sendInviteEmail(user.email, user.member?.firstName ?? 'there', inviteUrl),
      INVITE_EMAIL_TIMEOUT_MS,
      false,
    );
    await this.audit.record({
      actorUserId,
      action: 'ADMIN_INVITE_RESENT',
      entity: 'User',
      entityId: userId,
    });
    return { emailDelivered, inviteUrl: emailDelivered ? undefined : inviteUrl };
  }

  async update(userId: string, dto: UpdateAdminDto, actorUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { member: true, accessRoles: { include: { role: true } } },
    });
    if (!user || !['ADMIN', 'LEADER'].includes(user.role)) throw new NotFoundException('Admin not found');

    const currentRoleKeys = user.accessRoles.map((g) => g.role.key);
    const removingSuperAdmin =
      dto.roleIds !== undefined && currentRoleKeys.includes(SYSTEM_ROLE.SUPER_ADMIN);

    let nextRoles: { id: string; key: string }[] = user.accessRoles.map((g) => g.role);
    if (dto.roleIds) {
      nextRoles = await this.assertRolesExist(dto.roleIds);
      const willHaveSuperAdmin = nextRoles.some((r) => r.key === SYSTEM_ROLE.SUPER_ADMIN);
      if (removingSuperAdmin && !willHaveSuperAdmin && (await this.otherActiveSuperAdmins(userId)) === 0) {
        throw new BadRequestException('At least one active Super Admin must remain');
      }
    }

    const previous = {
      firstName: user.member?.firstName,
      lastName: user.member?.lastName,
      phoneNumber: user.member?.phoneNumber,
      roles: currentRoleKeys.sort(),
    };

    await this.prisma.$transaction(async (tx) => {
      const memberData: { firstName?: string; lastName?: string; phoneNumber?: string } = {};
      if (dto.firstName !== undefined) memberData.firstName = dto.firstName.trim();
      if (dto.lastName !== undefined) memberData.lastName = dto.lastName.trim();
      if (dto.phoneNumber !== undefined) memberData.phoneNumber = dto.phoneNumber.trim();
      if (Object.keys(memberData).length && user.member) {
        await tx.member.update({ where: { id: user.member.id }, data: memberData });
      }

      if (dto.roleIds) {
        const desired = new Set(nextRoles.map((r) => r.id));
        const current = new Set(user.accessRoles.map((g) => g.roleId));
        const toRemove = [...current].filter((id) => !desired.has(id));
        const toAdd = [...desired].filter((id) => !current.has(id));
        if (toRemove.length) {
          await tx.userAccessRole.deleteMany({ where: { userId, roleId: { in: toRemove } } });
        }
        for (const roleId of toAdd) {
          await tx.userAccessRole.create({ data: { userId, roleId, assignedById: actorUserId } });
        }
      }

      await this.audit.recordWithin(tx, {
        actorUserId,
        action: 'ADMIN_UPDATED',
        entity: 'User',
        entityId: userId,
        previousData: previous,
        newData: {
          firstName: dto.firstName ?? previous.firstName,
          lastName: dto.lastName ?? previous.lastName,
          phoneNumber: dto.phoneNumber ?? previous.phoneNumber,
          roles: dto.roleIds ? nextRoles.map((r) => r.key).sort() : previous.roles,
        },
      });
    });

    return this.list().then((team) => team.find((t) => t.id === userId));
  }

  async setActive(userId: string, active: boolean, actorUserId: string, reason?: string) {
    if (userId === actorUserId && !active) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { accessRoles: { include: { role: true } } },
    });
    if (!user || !['ADMIN', 'LEADER'].includes(user.role)) throw new NotFoundException('Admin not found');
    if (user.isActive === active) return this.list().then((team) => team.find((t) => t.id === userId));

    const isSuperAdmin = user.accessRoles.some((g) => g.role.key === SYSTEM_ROLE.SUPER_ADMIN);
    if (!active && isSuperAdmin && (await this.otherActiveSuperAdmins(userId)) === 0) {
      throw new BadRequestException('At least one active Super Admin must remain');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: active,
        deactivatedAt: active ? null : new Date(),
        deactivatedById: active ? null : actorUserId,
      },
    });
    await this.audit.record({
      actorUserId,
      action: active ? 'ADMIN_REACTIVATED' : 'ADMIN_DEACTIVATED',
      entity: 'User',
      entityId: userId,
      reason: reason || null,
    });
    return this.list().then((team) => team.find((t) => t.id === userId));
  }
}
