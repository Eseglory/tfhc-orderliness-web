import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  memberId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'tfhc-secret-key-2026'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { member: { include: { approvedMember: true } } },
    });

    if (!user) {
      throw new UnauthorizedException('User account no longer exists');
    }

    if (user.role === 'MEMBER' && (!user.member || user.member.status !== 'ACTIVE')) {
      throw new UnauthorizedException('Member account is not active');
    }
    if (user.role === 'MEMBER' && user.googleSubject &&
        (user.member.approvedMember?.status !== 'ACTIVE' || user.member.approvedMember.normalizedEmail !== user.email.toLowerCase())) {
      throw new UnauthorizedException('Member access has been revoked');
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      memberId: user.member?.id,
      memberCode: user.member?.memberCode,
      firstName: user.member?.firstName,
      lastName: user.member?.lastName,
    };
  }
}
