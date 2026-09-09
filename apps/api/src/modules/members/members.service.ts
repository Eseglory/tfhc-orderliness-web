import * as crypto from 'crypto';
import { BadRequestException, PayloadTooLargeException, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateMemberDto } from './member.dto';
import { MemberStatus } from '@tfhc/shared';

// sharp 0.35 is a CommonJS module whose export is the callable factory. With
// esModuleInterop disabled a plain `require` keeps both the runtime value and
// the call-signature typing correct.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp: typeof import('sharp').default = require('sharp');

@Injectable()
export class MembersService {
  constructor(private prisma: PrismaService) {}

  async findAll(query?: { status?: MemberStatus; subTeamId?: string; search?: string }) {
    const where: any = {};
    if (query?.status && !Object.values(MemberStatus).includes(query.status)) throw new BadRequestException('Invalid member status');
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
      include: { subTeam: true, approvedMember: { select: { email: true, status: true } }, user: { select: { id: true, email: true, role: true } } },
      orderBy: { lastName: 'asc' },
    });
  }

  async findOne(id: string) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: {
        subTeam: true,
        user: { select: { id: true, email: true, role: true } },
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

  async updatePhoto(id: string, file?: { buffer: Buffer; size: number }) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose a JPEG, PNG or WebP image');
    if (file.size > 2 * 1024 * 1024 || file.buffer.length > 2 * 1024 * 1024) throw new PayloadTooLargeException('Profile picture must be 2 MB or smaller');
    let output: Buffer;
    try {
      const image = sharp(file.buffer, { limitInputPixels: 25000000, animated: false });
      const metadata = await image.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) > 1) throw new Error('Unsupported image');
      output = await image.rotate().resize(512, 512, { fit: 'cover', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    } catch {
      throw new BadRequestException('Choose a valid, non-animated JPEG, PNG or WebP image (up to 25 megapixels)');
    }
    // Persist the normalized thumbnail with the profile so it survives deploys.
    const profilePhotoUrl = `data:image/webp;base64,${output.toString('base64')}`;
    await this.prisma.member.update({ where: { id }, data: { profilePhotoUrl } });
    return { profilePhotoUrl };
  }

  async removePhoto(id: string) {
    await this.prisma.member.update({ where: { id }, data: { profilePhotoUrl: null } });
    return { profilePhotoUrl: null };
  }

  async notifications(memberId: string) {
    return this.prisma.memberNotification.findMany({ where: { memberId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async readNotifications(memberId: string) {
    return this.prisma.memberNotification.updateMany({ where: { memberId, status: 'UNREAD' }, data: { status: 'READ', readAt: new Date() } });
  }

  async findProfile(id: string) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: { user: { select: { email: true } }, subTeam: true, celebrations: { where: { isActive: true }, orderBy: { type: 'asc' } } },
    });
    if (!member) throw new NotFoundException('Member profile not found');
    return member;
  }

  async updateSelfProfile(id: string, dto: Record<string, unknown>, assignments: { subTeamId?: string; roleInUnit?: string; status?: MemberStatus } = {}) {
    if (!dto || typeof dto !== 'object' || Array.isArray(dto)) throw new BadRequestException('Invalid profile');
    if ('email' in dto || 'normalizedEmail' in dto || 'user' in dto || 'approvedMember' in dto) throw new BadRequestException('Email cannot be changed');
    const text = (value: unknown, max: number, field: string) => {
      if (value === undefined) return undefined;
      if (typeof value !== 'string' || value.trim().length > max) throw new BadRequestException(`Invalid ${field}`);
      return value.trim() || null;
    };
    const date = (value: unknown, field: string) => {
      if (value === undefined) return undefined;
      if (value === null || value === '') return null;
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`Invalid ${field}`);
      const parsed = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || parsed > new Date()) throw new BadRequestException(`Invalid ${field}`);
      return parsed;
    };
    for (const field of ['firstName', 'lastName']) {
      if (dto[field] !== undefined && !text(dto[field], 80, field)) throw new BadRequestException(`${field} is required`);
    }
    const birthday = text(dto.birthday, 5, 'birthday');
    if (birthday) {
      const parsed = new Date(`2000-${birthday}T00:00:00.000Z`);
      if (!/^\d{2}-\d{2}$/.test(birthday) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(5, 10) !== birthday) throw new BadRequestException('Invalid birthday; use MM-DD');
    }
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
    if (celebrations && (celebrations.some((item) => !item.type || !item.date) || new Set(celebrations.map((item) => item.type)).size !== celebrations.length)) {
      throw new BadRequestException('Celebration dates must have unique types and valid dates');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.member.update({
        where: { id },
        data: {
          ...assignments,
          firstName: text(dto.firstName, 80, 'first name') ?? undefined,
          middleName: text(dto.middleName, 80, 'middle name'),
          lastName: text(dto.lastName, 80, 'last name') ?? undefined,
          preferredName: text(dto.preferredName, 80, 'preferred name'),
          phoneNumber: phone ?? undefined,
          alternatePhoneNumber: alternatePhone,
          address: text(dto.address, 300, 'address'),
          profession: text(dto.profession, 120, 'profession'),
          gender: text(dto.gender, 40, 'gender'),
          birthday,
          dateOfBirth: date(dto.dateOfBirth, 'date of birth'),
        },
      });
      if (celebrations) {
        await tx.memberCelebrationDate.deleteMany({ where: { memberId: id } });
        if (celebrations.length) await tx.memberCelebrationDate.createMany({ data: celebrations.map((item) => ({ memberId: id, type: item.type!, label: item.label, date: item.date! })) });
      }
      return tx.member.findUniqueOrThrow({
        where: { id },
        include: { user: { select: { email: true } }, subTeam: true, celebrations: { where: { isActive: true }, orderBy: { type: 'asc' } } },
      });
    });
  }

  async createMember(dto: {
    email?: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    gender?: string;
    subTeamId?: string;
    roleInUnit?: string;
    status?: MemberStatus;
  }) {
    const randomCode = crypto.randomBytes(6).toString('hex').toUpperCase();
    const memberCode = `TFHC-${randomCode}`;

    const email = dto.email?.trim().toLowerCase();
    if (email && (await this.prisma.approvedMember.findUnique({ where: { normalizedEmail: email } }) || await this.prisma.user.findUnique({ where: { email } }))) {
      throw new ConflictException('This Google email is already assigned to an account');
    }
    try {
      return await this.prisma.member.create({
        data: {
          memberCode,
          ...(email ? { approvedMember: { create: { email, normalizedEmail: email, status: 'ACTIVE' } } } : {}),
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
    } catch (error: any) {
      if (error.code === 'P2002') throw new ConflictException('Member code or Google email already exists; please retry with a unique email');
      throw error;
    }
  }

  async setGoogleAccess(id: string, dto: { email: string; status: 'ACTIVE' | 'REVOKED' }, actorId: string) {
    const email = dto.email.trim().toLowerCase();
    try {
      return await this.prisma.$transaction(async tx => {
        const member = await tx.member.findUnique({ where: { id }, include: { user: true, approvedMember: true } });
        if (!member) throw new NotFoundException('Member not found');
        if (member.approvedMember && member.approvedMember.normalizedEmail !== email) throw new BadRequestException('Email cannot be changed');
        if (member.user && member.user.role !== 'MEMBER') throw new BadRequestException('Google member access cannot be assigned to an administrator or leader');
        if (member.user && member.user.email.toLowerCase() !== email) throw new BadRequestException('The email of a linked account cannot be reassigned here');
        const existingUser = await tx.user.findUnique({ where: { email } });
        if (existingUser && existingUser.id !== member.userId) throw new ConflictException('This email belongs to another account');
        const saved = await tx.approvedMember.upsert({
          where: { memberId: id },
          create: { memberId: id, email, normalizedEmail: email, status: dto.status, importedBy: actorId },
          update: { email, normalizedEmail: email, status: dto.status, importedBy: actorId },
        });
        await tx.auditLog.create({ data: { actorUserId: actorId, action: 'GOOGLE_ACCESS_UPDATED', entity: 'ApprovedMember', entityId: saved.id, previousData: member.approvedMember ? { email: member.approvedMember.email, status: member.approvedMember.status } : {}, newData: { email, status: dto.status } } });
        return { email: saved.email, status: saved.status };
      });
    } catch (error: any) {
      if (error.code === 'P2002') throw new ConflictException('This email is already approved for another member');
      throw error;
    }
  }

  async updateMember(id: string, dto: UpdateMemberDto) {
    const member = await this.findOne(id);
    if (member.user && member.user.role !== 'MEMBER' && dto.status && dto.status !== 'ACTIVE') {
      throw new BadRequestException('Administrator and leader accounts cannot be deactivated through member management');
    }
    return this.updateSelfProfile(id, { ...dto }, { subTeamId: dto.subTeamId, roleInUnit: dto.roleInUnit, status: dto.status });
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
