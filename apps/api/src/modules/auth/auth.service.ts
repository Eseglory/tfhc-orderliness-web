import { BadRequestException, Injectable, UnauthorizedException, ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../../common/rbac/rbac.service';
import { hashInviteToken } from '../../common/invite-token';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { Role } from '@tfhc/shared';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private rbac: RbacService,
  ) {}

  async registerUser(dto: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    role?: Role;
    subTeamId?: string;
  }) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password);
    const role = dto.role || Role.MEMBER;

    // Use a large random space to avoid collisions as the directory grows.
    const randomCode = crypto.randomBytes(6).toString('hex').toUpperCase();
    const memberCode = `TFHC-${randomCode}`;

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          role,
        },
      });

      const createdMember = await tx.member.create({
        data: {
          userId: createdUser.id,
          memberCode,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phoneNumber: dto.phoneNumber,
          subTeamId: dto.subTeamId,
        },
      });

      return { ...createdUser, member: createdMember };
    });

    const token = this.generateToken(user.id, user.email, user.role, user.member.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        member: user.member,
      },
      accessToken: token,
    };
  }

  async loginUser(dto: { email: string; password: string }) {
    if (typeof dto.email !== 'string' || !dto.email.trim() || typeof dto.password !== 'string' || !dto.password) {
      throw new BadRequestException('Email and password are required');
    }
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { member: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.role === Role.MEMBER) {
      throw new ForbiddenException({ code: 'MEMBER_GOOGLE_AUTH_REQUIRED', message: 'Member accounts must sign in with Google.' });
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new ForbiddenException({ code: 'ACCOUNT_DEACTIVATED', message: 'This account has been deactivated. Contact a Super Admin.' });
    }
    if (user.inviteTokenHash) {
      throw new ForbiddenException({ code: 'INVITE_PENDING', message: 'Finish setting up your account from the invitation email before signing in.' });
    }

    const token = this.generateToken(
      user.id,
      user.email,
      user.role,
      user.member?.id
    );

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => undefined);
    const access = await this.rbac.resolveAccess(user.id, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        member: user.member,
        accessRoles: access.roleKeys,
        permissions: access.permissions,
        isSuperAdmin: access.isSuperAdmin,
      },
      accessToken: token,
    };
  }

  /**
   * Complete a staff invitation: verify the one-time token, set the password and
   * activate the account.
   */
  async acceptInvite(dto: { token: string; password: string }) {
    if (typeof dto?.token !== 'string' || dto.token.length < 20 || dto.token.length > 200) {
      throw new BadRequestException('Invalid invitation link');
    }
    if (typeof dto?.password !== 'string' || dto.password.length < 12 || dto.password.length > 1024) {
      throw new BadRequestException('Password must be at least 12 characters');
    }

    const tokenHash = hashInviteToken(dto.token);
    const user = await this.prisma.user.findUnique({ where: { inviteTokenHash: tokenHash }, include: { member: true } });
    if (!user || !user.inviteExpiresAt || user.inviteExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This invitation link is invalid or has expired');
    }

    const passwordHash = await argon2.hash(dto.password);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        isActive: true,
        inviteTokenHash: null,
        inviteExpiresAt: null,
        inviteAcceptedAt: new Date(),
        lastLoginAt: new Date(),
      },
      include: { member: true },
    });

    const access = await this.rbac.resolveAccess(updated.id, updated.role);
    const token = this.generateToken(updated.id, updated.email, updated.role, updated.member?.id);
    return {
      user: {
        id: updated.id,
        email: updated.email,
        role: updated.role,
        member: updated.member,
        accessRoles: access.roleKeys,
        permissions: access.permissions,
        isSuperAdmin: access.isSuperAdmin,
      },
      accessToken: token,
    };
  }

  async loginMemberWithGoogle(idToken: string) {
    const audienceValues = (process.env.GOOGLE_OAUTH_CLIENT_IDS || process.env.GOOGLE_OAUTH_CLIENT_ID || '').split(',').map((value) => value.trim()).filter((value) => Boolean(value) && !value.startsWith('REPLACE_'));
    if (!audienceValues.length) throw new ServiceUnavailableException({ code: 'GOOGLE_AUTH_NOT_CONFIGURED', message: 'Google sign-in is not configured.' });
    if (typeof idToken !== 'string' || !idToken || idToken.length > 10000) throw new UnauthorizedException('Invalid Google identity token');

    const google = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (!google?.ok) throw new UnauthorizedException('Google identity token could not be verified');
    const claims = await google.json().catch(() => null) as { aud?: string; iss?: string; sub?: string; email?: string; email_verified?: string | boolean; exp?: string } | null;
    if (!claims || typeof claims !== 'object') throw new UnauthorizedException('Google identity token is invalid');
    const verified = claims.email_verified === true || claims.email_verified === 'true';
    const expiresAt = Number(claims.exp ?? 0) * 1000;
    if (typeof claims.aud !== 'string' || !audienceValues.includes(claims.aud) || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss ?? '') || typeof claims.sub !== 'string' || !claims.sub || typeof claims.email !== 'string' || !claims.email.trim() || !verified || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new UnauthorizedException('Google identity token is invalid');
    }

    const normalizedEmail = claims.email.trim().toLowerCase();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          const approved = await tx.approvedMember.findUnique({ where: { normalizedEmail }, include: { member: { include: { user: true } } } });
          if (!approved || approved.status !== 'ACTIVE') throw new ForbiddenException({ code: 'MEMBER_NOT_AUTHORIZED', message: 'This account is not currently authorized to access TFHC Orderliness.' });
          if (!approved.member) throw new ForbiddenException({ code: 'MEMBER_ACCOUNT_NOT_LINKED', message: 'Your approved account is awaiting member record linking.' });
          if (approved.member.status !== 'ACTIVE') throw new ForbiddenException({ code: 'MEMBER_ACCOUNT_INACTIVE', message: 'This member account is not currently active.' });

          if (approved.member.user && approved.member.user.role !== Role.MEMBER) throw new ForbiddenException('This sign-in method is only available to member accounts');
          if (approved.member.user?.googleSubject && approved.member.user.googleSubject !== claims.sub) throw new ForbiddenException('This account is linked to a different Google identity');

          const existingSubject = await tx.user.findUnique({ where: { googleSubject: claims.sub } });
          if (existingSubject && existingSubject.id !== approved.member.userId) throw new ForbiddenException({ code: 'GOOGLE_IDENTITY_ALREADY_LINKED', message: 'This Google identity is linked to a different account.' });
          const existingEmail = await tx.user.findUnique({ where: { email: normalizedEmail } });
          if (existingEmail && existingEmail.id !== approved.member.userId) throw new ForbiddenException({ code: 'GOOGLE_EMAIL_ALREADY_LINKED', message: 'This Google email is linked to a different account.' });
          const user = approved.member.user
            ? (approved.member.user.googleSubject === claims.sub && approved.member.user.email === normalizedEmail ? approved.member.user : await tx.user.update({ where: { id: approved.member.user.id }, data: { googleSubject: claims.sub, email: normalizedEmail } }))
            : await tx.user.create({ data: { email: normalizedEmail, googleSubject: claims.sub, passwordHash: await argon2.hash(crypto.randomUUID()), role: Role.MEMBER } });
          if (!approved.member.userId) await tx.member.update({ where: { id: approved.member.id }, data: { userId: user.id } });
          const token = this.generateToken(user.id, user.email, Role.MEMBER, approved.member.id);
          return { user: { id: user.id, email: user.email, role: Role.MEMBER, member: approved.member }, accessToken: token };
        }, { isolationLevel: 'Serializable', timeout: 20000 });
      } catch (error: any) {
        if (!['P2002', 'P2034'].includes(error.code)) throw error;
      }
    }
    throw new ConflictException('Sign-in changed concurrently. Please try again.');
  }

  generateToken(userId: string, email: string, role: string, memberId?: string): string {
    const payload = { sub: userId, email, role, memberId };
    return this.jwtService.sign(payload);
  }
}
