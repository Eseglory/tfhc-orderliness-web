import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../../common/rbac/rbac.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  memberId?: string;
  /** Issued-at (seconds), set by jsonwebtoken. Compared to passwordChangedAt. */
  iat?: number;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
  memberId?: string;
  memberCode?: string;
  firstName?: string;
  lastName?: string;
  /** Effective RBAC permissions (wildcard already expanded). */
  permissions: string[];
  /** Access-role keys held, e.g. ['SUPER_ADMIN']. */
  accessRoles: string[];
  isSuperAdmin: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private rbac: RbacService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { member: { include: { approvedMember: true } } },
    });

    if (!user) {
      throw new UnauthorizedException('User account no longer exists');
    }

    // A password change / reset signs out every session issued beforehand.
    // jsonwebtoken's `iat` is whole seconds, so compare at second granularity:
    // a token issued in the same wall-clock second as the change is kept (that's
    // the freshly-issued one the caller keeps using).
    if (user.passwordChangedAt && typeof payload.iat === 'number' &&
        Math.floor(user.passwordChangedAt.getTime() / 1000) > payload.iat) {
      throw new UnauthorizedException('Your session ended because the account password was changed');
    }

    if (user.role === 'MEMBER' && (!user.member || user.member.status !== 'ACTIVE')) {
      throw new UnauthorizedException('Member account is not active');
    }
    // Revocation of a member's allowlist entry must take effect immediately, for
    // both Google and email/password members. Locally-signed test identities
    // (no googleSubject, no password auth) are exempt — they have no allowlist row.
    if (user.role === 'MEMBER' && (user.googleSubject || user.passwordAuthEnabled) &&
        (user.member.approvedMember?.status !== 'ACTIVE' || user.member.approvedMember.normalizedEmail !== user.email.toLowerCase())) {
      throw new UnauthorizedException('Member access has been revoked');
    }
    // Staff (non-member) accounts can be deactivated by a Super Admin; the block
    // must take effect immediately, not only at next login.
    if (user.role !== 'MEMBER' && !user.isActive) {
      throw new UnauthorizedException('This account has been deactivated');
    }

    // Members carry no RBAC grants; skip the extra lookup on the hot member path.
    const access = user.role === 'MEMBER'
      ? { permissions: [] as string[], roleKeys: [] as string[], roleNames: [] as string[], isSuperAdmin: false }
      : await this.rbac.resolveAccess(user.id, user.role);

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      memberId: user.member?.id,
      memberCode: user.member?.memberCode,
      firstName: user.member?.firstName,
      lastName: user.member?.lastName,
      permissions: access.permissions,
      accessRoles: access.roleKeys,
      isSuperAdmin: access.isSuperAdmin,
    };
  }
}
