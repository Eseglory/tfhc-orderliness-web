import { BadRequestException, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
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

  async findProfile(id: string) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: { user: { select: { email: true } }, celebrations: { where: { isActive: true }, orderBy: { type: 'asc' } } },
    });
    if (!member) throw new NotFoundException('Member profile not found');
    return member;
  }

  async updateSelfProfile(id: string, dto: Record<string, unknown>) {
    const text = (value: unknown, max: number, field: string) => {
      if (value === undefined) return undefined;
      if (typeof value !== 'string' || value.trim().length > max) throw new BadRequestException(`Invalid ${field}`);
      return value.trim() || null;
    };
    const date = (value: unknown, field: string) => {
      if (value === undefined) return undefined;
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`Invalid ${field}`);
      const parsed = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime()) || parsed > new Date()) throw new BadRequestException(`Invalid ${field}`);
      return parsed;
    };
    const phone = text(dto.phoneNumber, 32, 'phone number');
    if (phone !== undefined && !/^[+0-9 ()-]{7,32}$/.test(phone ?? '')) throw new BadRequestException('Invalid phone number');
    const alternatePhone = text(dto.alternatePhoneNumber, 32, 'alternate phone number');
    if (alternatePhone !== undefined && alternatePhone && !/^[+0-9 ()-]{7,32}$/.test(alternatePhone)) throw new BadRequestException('Invalid alternate phone number');
    const celebrationDates = Array.isArray(dto.celebrations) ? dto.celebrations : undefined;
    if (celebrationDates && celebrationDates.length > 8) throw new BadRequestException('Too many celebration dates');
    const celebrations = celebrationDates?.map((item: any) => ({
      type: text(item?.type, 50, 'celebration type')?.toUpperCase(),
      label: text(item?.label, 120, 'celebration label'),
      date: date(item?.date, 'celebration date'),
    }));
    if (celebrations?.some((item) => !item.type || !item.date) || new Set(celebrations?.map((item) => item.type)).size !== celebrations?.length) {
      throw new BadRequestException('Celebration dates must have unique types and valid dates');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.member.update({
        where: { id },
        data: {
          firstName: text(dto.firstName, 80, 'first name') ?? undefined,
          middleName: text(dto.middleName, 80, 'middle name'),
          lastName: text(dto.lastName, 80, 'last name') ?? undefined,
          preferredName: text(dto.preferredName, 80, 'preferred name'),
          phoneNumber: phone ?? undefined,
          alternatePhoneNumber: alternatePhone,
          address: text(dto.address, 300, 'address'),
          dateOfBirth: date(dto.dateOfBirth, 'date of birth'),
        },
      });
      if (celebrations) {
        await tx.memberCelebrationDate.deleteMany({ where: { memberId: id } });
        if (celebrations.length) await tx.memberCelebrationDate.createMany({ data: celebrations.map((item) => ({ memberId: id, type: item.type!, label: item.label, date: item.date! })) });
      }
      return tx.member.findUniqueOrThrow({
        where: { id },
        include: { user: { select: { email: true } }, celebrations: { where: { isActive: true }, orderBy: { type: 'asc' } } },
      });
    });
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
