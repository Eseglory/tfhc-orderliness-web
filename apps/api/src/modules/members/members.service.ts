import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MemberStatus } from '@tfhc/shared';

@Injectable()
export class MembersService {
  constructor(private prisma: PrismaService) {}

  async findAll(query?: { status?: MemberStatus; subTeamId?: string; search?: string }) {
    const where: any = {};
    if (query?.status) where.status = query.status;
    if (query?.subTeamId) where.subTeamId = query.subTeamId;
    if (query?.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { memberCode: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.member.findMany({
      where,
      include: { subTeam: true, user: true },
      orderBy: { lastName: 'asc' },
    });
  }

  async findOne(id: string) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: {
        subTeam: true,
        user: true,
        attendanceRecords: {
          include: { meeting: { include: { category: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        excuseRequests: true,
        followUpFlags: true,
      },
    });

    if (!member) {
      throw new NotFoundException(`Member with ID ${id} not found`);
    }

    return member;
  }

  async createMember(dto: {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    gender?: string;
    subTeamId?: string;
    roleInUnit?: string;
    status?: MemberStatus;
  }) {
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    const memberCode = `TFHC-${randomCode}`;

    return this.prisma.member.create({
      data: {
        memberCode,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phoneNumber: dto.phoneNumber,
        gender: dto.gender,
        subTeamId: dto.subTeamId,
        roleInUnit: dto.roleInUnit || 'Member',
        status: dto.status || MemberStatus.ACTIVE,
      },
      include: { subTeam: true },
    });
  }

  async updateMember(
    id: string,
    dto: {
      firstName?: string;
      lastName?: string;
      phoneNumber?: string;
      gender?: string;
      subTeamId?: string;
      roleInUnit?: string;
      status?: MemberStatus;
    }
  ) {
    await this.findOne(id);

    return this.prisma.member.update({
      where: { id },
      data: dto,
      include: { subTeam: true },
    });
  }

  async createSubTeam(dto: { name: string; description?: string }) {
    const existing = await this.prisma.subTeam.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException('Sub-team with this name already exists');
    }

    return this.prisma.subTeam.create({ data: dto });
  }

  async getSubTeams() {
    return this.prisma.subTeam.findMany({
      include: { _count: { select: { members: true } } },
    });
  }
}
