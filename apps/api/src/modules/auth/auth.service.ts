import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as argon2 from 'argon2';
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

  generateToken(userId: string, email: string, role: string, memberId?: string): string {
    const payload = { sub: userId, email, role, memberId };
    return this.jwtService.sign(payload);
  }
}
