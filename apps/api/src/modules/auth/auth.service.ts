import { Injectable, UnauthorizedException, ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { Role } from '@tfhc/shared';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService
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

    // Generate unique member code (e.g. TFHC-7890)
    const randomCode = Math.floor(1000 + Math.random() * 9000);
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

    const token = this.generateToken(
      user.id,
      user.email,
      user.role,
      user.member?.id
    );

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

  async loginMemberWithGoogle(idToken: string) {
    const audienceValues = (process.env.GOOGLE_OAUTH_CLIENT_IDS || process.env.GOOGLE_OAUTH_CLIENT_ID || '').split(',').map((value) => value.trim()).filter((value) => Boolean(value) && !value.startsWith('REPLACE_'));
    if (!audienceValues.length) throw new ServiceUnavailableException({ code: 'GOOGLE_AUTH_NOT_CONFIGURED', message: 'Google sign-in is not configured.' });
    if (!idToken || idToken.length > 10000) throw new UnauthorizedException('Invalid Google identity token');

    const google = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (!google?.ok) throw new UnauthorizedException('Google identity token could not be verified');
    const claims = await google.json() as { aud?: string; iss?: string; sub?: string; email?: string; email_verified?: string | boolean; exp?: string };
    const verified = claims.email_verified === true || claims.email_verified === 'true';
    const expiresAt = Number(claims.exp ?? 0) * 1000;
    if (!claims.aud || !audienceValues.includes(claims.aud) || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss ?? '') || !claims.sub || !claims.email || !verified || expiresAt <= Date.now()) {
      throw new UnauthorizedException('Google identity token is invalid');
    }

    const normalizedEmail = claims.email.trim().toLowerCase();
    const approved = await this.prisma.approvedMember.findUnique({ where: { normalizedEmail }, include: { member: { include: { user: true } } } });
    if (!approved || approved.status !== 'ACTIVE') throw new ForbiddenException({ code: 'MEMBER_NOT_AUTHORIZED', message: 'This account is not currently authorized to access TFHC Orderliness.' });
    if (!approved.member) throw new ForbiddenException({ code: 'MEMBER_ACCOUNT_NOT_LINKED', message: 'Your approved account is awaiting member record linking.' });
    if (approved.member.status !== 'ACTIVE') throw new ForbiddenException({ code: 'MEMBER_ACCOUNT_INACTIVE', message: 'This member account is not currently active.' });

    const existingSubject = await this.prisma.user.findUnique({ where: { googleSubject: claims.sub } });
    if (existingSubject && existingSubject.id !== approved.member.userId) throw new ForbiddenException({ code: 'GOOGLE_IDENTITY_ALREADY_LINKED', message: 'This Google identity is linked to a different account.' });
    const existingEmail = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingEmail && existingEmail.id !== approved.member.userId) throw new ForbiddenException({ code: 'GOOGLE_EMAIL_ALREADY_LINKED', message: 'This Google email is linked to a different account.' });
    const user = approved.member.user
      ? await this.prisma.user.update({ where: { id: approved.member.user.id }, data: { googleSubject: claims.sub, email: normalizedEmail } })
      : await this.prisma.user.create({ data: { email: normalizedEmail, googleSubject: claims.sub, passwordHash: await argon2.hash(crypto.randomUUID()), role: Role.MEMBER } });
    if (!approved.member.userId) await this.prisma.member.update({ where: { id: approved.member.id }, data: { userId: user.id } });
    const token = this.generateToken(user.id, user.email, Role.MEMBER, approved.member.id);
    return { user: { id: user.id, email: user.email, role: Role.MEMBER, member: approved.member }, accessToken: token };
  }

  generateToken(userId: string, email: string, role: string, memberId?: string): string {
    const payload = { sub: userId, email, role, memberId };
    return this.jwtService.sign(payload);
  }
}
