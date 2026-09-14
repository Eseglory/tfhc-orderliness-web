import { BadRequestException, Injectable, UnauthorizedException, ConflictException, ForbiddenException, ServiceUnavailableException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../../common/rbac/rbac.service';
import { MailService } from '../mail/mail.service';
import { renderVerificationEmail, renderPasswordResetEmail } from '../mail/templates';
import { hashInviteToken } from '../../common/invite-token';
import { webBaseUrl } from '../../common/web-url';
import { settleWithin } from '../../common/settle-within';
import { MIN_PASSWORD_LENGTH } from './auth.dto';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { Role, toPascalCase, bestNameMatch, validateEmail, normalizeEmail } from '@tfhc/shared';
import { MemberStatus } from '@prisma/client';


const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
// Long enough to absorb a cold TLS handshake to the SMTP server on the first
// send after a restart; the pooled transport keeps later sends fast.
const AUTH_EMAIL_TIMEOUT_MS = 15000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private rbac: RbacService,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  private isProd() {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  /**
   * Public member self-registration. The email must already be ACTIVE on the
   * ApprovedMember allowlist and linked to an active member record — the same
   * gate the Google sign-in path enforces. Never returns a session: the account
   * is unusable until the emailed verification link is followed.
   */
  async registerUser(dto: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
  }) {
    const emailValidation = validateEmail(dto.email, { allowTestDomains: !this.isProd() });
    if (!emailValidation.isValid) {
      throw new BadRequestException({
        code: 'INVALID_EMAIL',
        message: emailValidation.reason || 'Invalid email address',
      });
    }
    const normalizedEmail = emailValidation.normalizedEmail;
    const firstName = toPascalCase(dto.firstName);
    const lastName = toPascalCase(dto.lastName);

    if (!dto.password || typeof dto.password !== 'string' || dto.password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    const { rawToken, currentMember } = await this.prisma.$transaction(async (tx) => {
      const approved = await tx.approvedMember.findUnique({
        where: { normalizedEmail },
        include: { member: { include: { user: true } } },
      });
      if (!approved || approved.status !== 'ACTIVE') {
        throw new ForbiddenException({
          code: 'EMAIL_NOT_IN_LOOKUP_TABLE',
          message: "This email is not on the church member directory / lookup table. Please contact the unit administrator to be added first.",
        });
      }

      // Email validation: You cannot register twice
      const existingUser = approved.member?.user || (await tx.user.findUnique({ where: { email: normalizedEmail } }));
      if (existingUser) {
        if (existingUser.googleSubject && !existingUser.passwordAuthEnabled) {
          throw new ConflictException({
            code: 'ALREADY_REGISTERED_WITH_GOOGLE',
            message: 'This email is already registered via Google Sign-In. You cannot register with a password. Please sign in with Google.',
          });
        }
        throw new ConflictException({
          code: 'ALREADY_REGISTERED',
          message: 'An account with this email already exists. You cannot register twice. Please sign in with your password, or use "Forgot password" if needed.',
        });
      }

      let member = approved.member;
      if (!member) {
        // Check if there is an existing unlinked member whose name matches via fuzzy/LIKE comparison
        const unlinkedMembers = await tx.member.findMany({
          where: { approvedMember: null },
          select: { id: true, firstName: true, lastName: true, middleName: true, preferredName: true, phoneNumber: true, status: true },
        });
        const matchRes = bestNameMatch(
          `${firstName} ${lastName}`,
          unlinkedMembers,
          (c) => [
            `${c.firstName} ${c.lastName}`,
            `${c.lastName} ${c.firstName}`,
            c.middleName ? `${c.firstName} ${c.middleName} ${c.lastName}` : '',
            c.preferredName ? `${c.preferredName} ${c.lastName}` : '',
          ].filter(Boolean),
          0.65,
        );

        let matchedOrCreatedMember = matchRes.match
          ? await tx.member.update({
              where: { id: matchRes.match.id },
              data: {
                firstName: toPascalCase(matchRes.match.firstName || firstName),
                lastName: toPascalCase(matchRes.match.lastName || lastName),
                phoneNumber: matchRes.match.phoneNumber?.length >= 7 ? matchRes.match.phoneNumber : dto.phoneNumber.trim(),
              },
            })
          : null;

        if (!matchedOrCreatedMember) {
          const memberCode = `TFHC-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
          matchedOrCreatedMember = await tx.member.create({
            data: {
              memberCode,
              firstName,
              lastName,
              phoneNumber: dto.phoneNumber.trim(),
              status: MemberStatus.ACTIVE,
            },
          });
        }
        await tx.approvedMember.update({
          where: { id: approved.id },
          data: { memberId: matchedOrCreatedMember.id },
        });
        member = matchedOrCreatedMember as any;
      } else if (member.status !== 'ACTIVE') {
        throw new ForbiddenException({ code: 'MEMBER_ACCOUNT_INACTIVE', message: 'This member account is not currently active.' });
      }

      const passwordHash = await argon2.hash(dto.password);
      const rawToken = crypto.randomBytes(32).toString('hex');
      const verifyFields = {
        passwordHash,
        passwordAuthEnabled: true,
        googleSubject: null,
        emailVerifiedAt: null,
        emailVerifyTokenHash: hashInviteToken(rawToken),
        emailVerifyExpiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
      };

      const user = await tx.user.create({
        data: { email: normalizedEmail, role: Role.MEMBER, ...verifyFields },
      });
      await tx.member.update({ where: { id: member.id }, data: { userId: user.id } });

      // Fill in any blank directory fields from the registration form in Pascal Case; never
      // overwrite data an administrator already imported.
      await tx.member.update({
        where: { id: member.id },
        data: {
          firstName: toPascalCase(member.firstName || firstName),
          lastName: toPascalCase(member.lastName || lastName),
          phoneNumber: member.phoneNumber?.trim() || dto.phoneNumber.trim(),
        },
      });

      return { rawToken, currentMember: member };
    }, { isolationLevel: 'Serializable', timeout: 20000 }).catch((error: any) => {
      if (error.code === 'P2002') {
        throw new ConflictException({
          code: 'ALREADY_REGISTERED',
          message: 'An account with this email already exists. You cannot register twice.',
        });
      }
      throw error;
    });

    const verifyUrl = `${webBaseUrl(this.config)}/verify-email?token=${rawToken}`;
    const delivered = await this.sendVerificationEmail(normalizedEmail, currentMember.firstName || dto.firstName, verifyUrl);
    return {
      pendingVerification: true,
      // Only ever exposed in non-production when SMTP is unavailable, so local
      // development and the e2e suite aren't blocked on a mail server.
      verifyUrl: !delivered && !this.isProd() ? verifyUrl : undefined,
    };
  }

  async verifyEmail(dto: { token: string }) {
    const tokenHash = hashInviteToken(dto.token);
    const user = await this.prisma.user.findUnique({ where: { emailVerifyTokenHash: tokenHash }, include: { member: true } });
    if (!user || !user.emailVerifyExpiresAt || user.emailVerifyExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException({ code: 'VERIFICATION_INVALID', message: 'This verification link is invalid or has expired. Request a new one from the sign-in page.' });
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerifyTokenHash: null,
        emailVerifyExpiresAt: null,
        passwordChangedAt: user.passwordChangedAt ?? new Date(),
        lastLoginAt: new Date(),
      },
      include: { member: true },
    });
    return this.buildAuthResponse(updated);
  }

  async resendVerification(dto: { email: string }) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail }, include: { member: true } });
    let devUrl: string | undefined;
    if (user && user.passwordAuthEnabled && !user.emailVerifiedAt) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerifyTokenHash: hashInviteToken(rawToken), emailVerifyExpiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS) },
      });
      const verifyUrl = `${webBaseUrl(this.config)}/verify-email?token=${rawToken}`;
      const delivered = await this.sendVerificationEmail(normalizedEmail, user.member?.firstName ?? 'there', verifyUrl);
      if (!delivered && !this.isProd()) devUrl = verifyUrl;
    }
    // Uniform response regardless of whether the account exists.
    return { ok: true, devUrl };
  }

  async forgotPassword(dto: { email: string }) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail }, include: { member: true } });
    let devUrl: string | undefined;
    if (user && user.passwordAuthEnabled) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordResetTokenHash: hashInviteToken(rawToken), passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) },
      });
      const resetUrl = `${webBaseUrl(this.config)}/reset-password?token=${rawToken}`;
      const { subject, text, html } = renderPasswordResetEmail(user.member?.firstName ?? 'there', resetUrl);
      const delivered = await settleWithin(
        this.mail.sendEmail({ to: normalizedEmail, subject, text, html }).then(() => true),
        AUTH_EMAIL_TIMEOUT_MS,
        false,
      );
      if (!delivered) this.logger.warn(`Password reset email to ${normalizedEmail} was not delivered`);
      if (!delivered && !this.isProd()) devUrl = resetUrl;
    }
    return { ok: true, devUrl };
  }

  async resetPassword(dto: { token: string; password: string }) {
    if (typeof dto?.password !== 'string' || dto.password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    if (typeof dto?.token !== 'string' || !dto.token.trim()) {
      throw new BadRequestException({ code: 'RESET_INVALID', message: 'This reset link is invalid or has expired. Request a new one.' });
    }
    const tokenHash = hashInviteToken(dto.token.trim());
    const user = await this.prisma.user.findUnique({ where: { passwordResetTokenHash: tokenHash }, include: { member: true } });
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException({ code: 'RESET_INVALID', message: 'This reset link is invalid or has expired. Request a new one.' });
    }
    const passwordHash = await argon2.hash(dto.password);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        // A working reset link also proves control of the inbox.
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        passwordChangedAt: new Date(),
        lastLoginAt: new Date(),
      },
      include: { member: true },
    });
    return this.buildAuthResponse(updated);
  }

  async changePassword(userId: string, dto: { currentPassword: string; newPassword: string }) {
    if (typeof dto?.newPassword !== 'string' || dto.newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { member: true } });
    if (!user || !user.passwordAuthEnabled) {
      throw new ForbiddenException('This account does not use a password.');
    }
    const currentValid = await argon2.verify(user.passwordHash, dto.currentPassword).catch(() => false);
    if (!currentValid) {
      throw new BadRequestException({ code: 'CURRENT_PASSWORD_INVALID', message: 'Your current password is incorrect.' });
    }
    if (await argon2.verify(user.passwordHash, dto.newPassword).catch(() => false)) {
      throw new BadRequestException({ code: 'PASSWORD_REUSED', message: 'Choose a password you have not used before.' });
    }
    const changedAt = new Date();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await argon2.hash(dto.newPassword), passwordChangedAt: changedAt },
    });
    // Re-issue the caller's token so their current session isn't invalidated by
    // the passwordChangedAt bump; every other session is signed out.
    return { accessToken: this.generateToken(user.id, user.email, user.role, user.member?.id) };
  }

  /**
   * Sessions are stateless JWTs, so logout is primarily a client concern
   * (drop the token). This just records the event for the account timeline.
   */
  async logout(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { lastLogoutAt: new Date() } }).catch(() => undefined);
    return { ok: true };
  }

  async loginUser(dto: { email: string; password: string }) {
    if (typeof dto.email !== 'string' || !dto.email.trim() || typeof dto.password !== 'string' || !dto.password) {
      throw new BadRequestException('Email and password are required');
    }
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      include: { member: { include: { approvedMember: true } } },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.inviteTokenHash) {
      throw new ForbiddenException({ code: 'INVITE_PENDING', message: 'Finish setting up your account from the invitation email before signing in.' });
    }

    // Mutual exclusivity: if registered via Google OAuth, cannot use password
    if (user.googleSubject && !user.passwordAuthEnabled) {
      throw new ForbiddenException({
        code: 'AUTH_METHOD_GOOGLE_ONLY',
        message: 'This account was registered with Google Sign-In. You cannot sign in with a password. Please use Sign in with Google.',
      });
    }

    if (!user.passwordAuthEnabled) {
      throw new ForbiddenException({
        code: 'PASSWORD_AUTH_DISABLED',
        message: 'Password sign-in is not enabled for this account. Please sign in with Google or contact the administrator.',
      });
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password).catch(() => false);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.passwordAuthEnabled && !user.emailVerifiedAt) {
      throw new ForbiddenException({ code: 'EMAIL_VERIFICATION_PENDING', message: 'Confirm your email address first. Check your inbox for the verification link.' });
    }
    if (!user.isActive) {
      throw new ForbiddenException({ code: 'ACCOUNT_DEACTIVATED', message: 'This account has been deactivated. Contact a Super Admin.' });
    }
    if (user.inviteTokenHash) {
      throw new ForbiddenException({ code: 'INVITE_PENDING', message: 'Finish setting up your account from the invitation email before signing in.' });
    }
    if (user.role === Role.MEMBER) {
      if (!user.member || user.member.status !== 'ACTIVE') {
        throw new ForbiddenException({ code: 'MEMBER_ACCOUNT_INACTIVE', message: 'This member account is not currently active.' });
      }
      if (user.member.approvedMember?.status !== 'ACTIVE' || user.member.approvedMember.normalizedEmail !== user.email.toLowerCase()) {
        throw new ForbiddenException({ code: 'MEMBER_NOT_AUTHORIZED', message: 'This account is not currently authorized to access TFHC Orderliness.' });
      }
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => undefined);
    return this.buildAuthResponse(user);
  }

  /**
   * Complete a staff invitation: verify the one-time token, set the password and
   * activate the account.
   */
  async acceptInvite(dto: { token: string; password: string }) {
    if (typeof dto?.token !== 'string' || dto.token.length < 20 || dto.token.length > 200) {
      throw new BadRequestException('Invalid invitation link');
    }
    if (typeof dto?.password !== 'string' || dto.password.length < MIN_PASSWORD_LENGTH || dto.password.length > 1024) {
      throw new BadRequestException(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    const tokenHash = hashInviteToken(dto.token);
    let user = await this.prisma.user.findUnique({ where: { inviteTokenHash: tokenHash }, include: { member: true } });
    const approvedMember = await this.prisma.approvedMember.findUnique({
      where: { inviteTokenHash: tokenHash },
      include: { member: { include: { user: true } } },
    });

    if (!user && approvedMember?.member?.user) {
      user = approvedMember.member.user as any;
    }

    if (!user || !user.inviteExpiresAt || user.inviteExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This invitation link is invalid or has expired');
    }

    const passwordHash = await argon2.hash(dto.password);
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          isActive: true,
          passwordAuthEnabled: true,
          googleSubject: null,
          emailVerifiedAt: new Date(),
          passwordChangedAt: new Date(),
          inviteTokenHash: null,
          inviteExpiresAt: null,
          inviteAcceptedAt: new Date(),
          lastLoginAt: new Date(),
        },
        include: { member: true },
      });

      const approvedId =
        approvedMember?.id ||
        (await tx.approvedMember.findUnique({ where: { normalizedEmail: u.email.toLowerCase() } }))?.id;
      if (approvedId) {
        await tx.approvedMember.update({
          where: { id: approvedId },
          data: {
            inviteStatus: 'ACCEPTED',
            inviteTokenHash: null,
            inviteExpiresAt: null,
          },
        });
      }

      return u;
    });

    return this.buildAuthResponse(updated);
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
          if (!approved || approved.status !== 'ACTIVE') {
            throw new ForbiddenException({
              code: 'EMAIL_NOT_IN_LOOKUP_TABLE',
              message: 'This email is not on the church member directory / lookup table. Please contact the unit administrator to add you before signing in.',
            });
          }
          let currentMember = approved.member;
          if (!currentMember) {
            // Find existing unlinked member via LIKE matching on email prefix name tokens
            const unlinkedMembers = await tx.member.findMany({
              where: { approvedMember: null },
              select: { id: true, firstName: true, lastName: true, middleName: true, preferredName: true, status: true },
            });
            const emailPrefix = normalizedEmail.split('@')[0].replace(/[0-9._-]+/g, ' ');
            const matchRes = bestNameMatch(
              emailPrefix,
              unlinkedMembers,
              (c) => [
                `${c.firstName} ${c.lastName}`,
                `${c.lastName} ${c.firstName}`,
                c.middleName ? `${c.firstName} ${c.middleName} ${c.lastName}` : '',
                c.preferredName ? `${c.preferredName} ${c.lastName}` : '',
              ].filter(Boolean),
              0.60,
            );

            if (matchRes.match) {
              currentMember = await tx.member.findUnique({
                where: { id: matchRes.match.id },
                include: { user: true },
              });
              await tx.approvedMember.update({
                where: { id: approved.id },
                data: { memberId: currentMember!.id },
              });
            } else {
              const memberCode = `TFHC-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
              const givenName = toPascalCase(claims.email?.split('@')[0] || 'Member');
              currentMember = await tx.member.create({
                data: {
                  memberCode,
                  firstName: givenName,
                  lastName: '',
                  phoneNumber: '',
                  status: MemberStatus.ACTIVE,
                },
                include: { user: true },
              });
              await tx.approvedMember.update({
                where: { id: approved.id },
                data: { memberId: currentMember.id },
              });
            }
          } else if (currentMember.status !== 'ACTIVE') {
            throw new ForbiddenException({ code: 'MEMBER_ACCOUNT_INACTIVE', message: 'This member account is not currently active.' });
          }


          // Strict exclusivity: Check if an existing user with this email was registered via password
          const existingUser = currentMember.user || (await tx.user.findUnique({ where: { email: normalizedEmail } }));
          if (existingUser) {
            if (existingUser.role !== Role.MEMBER || !existingUser.isActive) {
              throw new ForbiddenException('This account cannot use member Google sign-in');
            }
            if (existingUser.passwordAuthEnabled && !existingUser.googleSubject) {
              throw new ForbiddenException({
                code: 'AUTH_METHOD_PASSWORD_ONLY',
                message: 'This account was registered with email and password. You cannot sign in with Google. Please sign in with your password.',
              });
            }
            if (existingUser.googleSubject && existingUser.googleSubject !== claims.sub) {
              throw new ForbiddenException({
                code: 'GOOGLE_IDENTITY_MISMATCH',
                message: 'This account is linked to a different Google identity.',
              });
            }
          }

          const existingSubject = await tx.user.findUnique({ where: { googleSubject: claims.sub } });
          if (existingSubject && existingSubject.email.toLowerCase() !== normalizedEmail) {
            throw new ForbiddenException({
              code: 'GOOGLE_IDENTITY_ALREADY_LINKED',
              message: 'This Google identity is linked to a different account email.',
            });
          }

          const user = existingUser
            ? (existingUser.googleSubject === claims.sub ? existingUser : await tx.user.update({ where: { id: existingUser.id }, data: { googleSubject: claims.sub, email: normalizedEmail } }))
            : await tx.user.create({
                data: {
                  email: normalizedEmail,
                  googleSubject: claims.sub,
                  passwordAuthEnabled: false,
                  emailVerifiedAt: new Date(),
                  passwordHash: await argon2.hash(crypto.randomUUID()),
                  role: Role.MEMBER
                }
              });

          if (!currentMember.userId || currentMember.userId !== user.id) {
            await tx.member.update({ where: { id: currentMember.id }, data: { userId: user.id } });
          }
          const token = this.generateToken(user.id, user.email, user.role, currentMember.id);
          return { user: { id: user.id, email: user.email, role: user.role, member: currentMember }, accessToken: token };
        }, { isolationLevel: 'Serializable', timeout: 20000 });
      } catch (error: any) {
        if (!['P2002', 'P2034'].includes(error.code)) throw error;
      }
    }
    throw new ConflictException('Sign-in changed concurrently. Please try again.');
  }

  private async sendVerificationEmail(email: string, firstName: string, verifyUrl: string): Promise<boolean> {
    const { subject, text, html } = renderVerificationEmail(firstName, verifyUrl);
    const delivered = await settleWithin(
      this.mail.sendEmail({ to: email, subject, text, html }).then(() => true),
      AUTH_EMAIL_TIMEOUT_MS,
      false,
    );
    if (!delivered) this.logger.warn(`Verification email to ${email} was not delivered`);
    return delivered;
  }

  /** Shared response body for every flow that ends in an authenticated session. */
  private async buildAuthResponse(user: { id: string; email: string; role: string; member?: ({ id: string } & Record<string, unknown>) | null }) {
    const access = user.role === Role.MEMBER
      ? { roleKeys: [] as string[], permissions: [] as string[], isSuperAdmin: false }
      : await this.rbac.resolveAccess(user.id, user.role);
    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        member: user.member ?? null,
        accessRoles: access.roleKeys,
        permissions: access.permissions,
        isSuperAdmin: access.isSuperAdmin,
      },
      accessToken: this.generateToken(user.id, user.email, user.role, user.member?.id),
    };
  }

  generateToken(userId: string, email: string, role: string, memberId?: string): string {
    const payload = { sub: userId, email, role, memberId };
    return this.jwtService.sign(payload);
  }
}
