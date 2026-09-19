import * as crypto from 'crypto';
import { BadRequestException, PayloadTooLargeException, Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { UpdateMemberDto } from './member.dto';
import { MemberStatus, toPascalCase } from '@tfhc/shared';

import { LookupsService } from '../lookups/lookups.service';

// sharp 0.35 is a CommonJS module whose export is the callable factory. With
// esModuleInterop disabled a plain `require` keeps both the runtime value and
// the call-signature typing correct.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp: typeof import('sharp').default = require('sharp');

@Injectable()
export class MembersService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
    private lookupsService: LookupsService,
  ) {}

  async findAll(query?: { status?: MemberStatus; subTeamId?: string; search?: string }) {
    const key = JSON.stringify([query?.status, query?.subTeamId, query?.search]);
    return this.cache.wrap(`members:all:${key}`, 30, async () => {
      const where: any = {
        // Only show members whose email is in the approved member directory / lookup table
        approvedMember: {
          isNot: null,
          is: {
            status: 'ACTIVE',
          },
        },
      };
      if (query?.status && !Object.values(MemberStatus).includes(query.status)) throw new BadRequestException('Invalid member status');
      if (query?.status) where.status = query.status;
      if (query?.subTeamId) where.subTeamId = query.subTeamId;
      if (query?.search) {
        where.OR = [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { middleName: { contains: query.search, mode: 'insensitive' } },
          { preferredName: { contains: query.search, mode: 'insensitive' } },
          { memberCode: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      return this.prisma.member.findMany({
        where,
        include: {
          approvedMember: { select: { email: true, status: true, source: true } },
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              googleSubject: true,
              passwordAuthEnabled: true,
              emailVerifiedAt: true,
              lastLoginAt: true,
            },
          },
          attendanceRecords: {
            select: {
              id: true,
              status: true,
              createdAt: true,
              meeting: { select: { id: true, title: true, startTime: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          _count: {
            select: {
              attendanceRecords: true,
              duesAssignments: true,
              payments: true,
            },
          },
        },
        orderBy: { firstName: 'asc' },
      });
    }, ['members']);
  }

  async findOne(id: string) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: {
        approvedMember: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            googleSubject: true,
            passwordAuthEnabled: true,
            emailVerifiedAt: true,
            lastLoginAt: true,
          },
        },
        attendanceRecords: {
          include: { meeting: { include: { category: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        excuseRequests: true,
        followUpFlags: true,
        duesAssignments: {
          include: { period: true },
          orderBy: [{ period: { year: 'desc' } }, { period: { month: 'desc' } }],
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!member) {
      throw new NotFoundException(`Member with ID ${id} not found`);
    }

    return member;
  }


  async updatePhoto(id: string, file?: { buffer: Buffer; size: number }) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose a JPEG, PNG or WebP image');
    if (file.size > 1024 * 1024 || file.buffer.length > 1024 * 1024) throw new PayloadTooLargeException('Profile picture must be 1 MB or smaller');
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

  async updateBanner(id: string, file?: { buffer: Buffer; size: number }) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose a JPEG, PNG or WebP image');
    if (file.size > 1024 * 1024 || file.buffer.length > 1024 * 1024) throw new PayloadTooLargeException('Banner must be 1 MB or smaller');
    let output: Buffer;
    try {
      const image = sharp(file.buffer, { limitInputPixels: 25000000, animated: false });
      const metadata = await image.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) > 1) throw new Error('Unsupported image');
      output = await image.rotate().resize(1200, 400, { fit: 'cover', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    } catch {
      throw new BadRequestException('Choose a valid, non-animated JPEG, PNG or WebP image (up to 25 megapixels)');
    }
    const bannerPhotoUrl = `data:image/webp;base64,${output.toString('base64')}`;
    await this.prisma.member.update({ where: { id }, data: { bannerPhotoUrl } });
    return { bannerPhotoUrl };
  }

  async setBannerUrl(id: string, bannerUrl: string) {
    if (!bannerUrl || typeof bannerUrl !== 'string' || bannerUrl.length > 10000) {
      throw new BadRequestException('Invalid banner URL');
    }
    await this.prisma.member.update({ where: { id }, data: { bannerPhotoUrl: bannerUrl } });
    return { bannerPhotoUrl: bannerUrl };
  }

  async removeBanner(id: string) {
    await this.prisma.member.update({ where: { id }, data: { bannerPhotoUrl: null } });
    return { bannerPhotoUrl: null };
  }

  async notifications(memberId: string) {
    return this.prisma.memberNotification.findMany({ where: { memberId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async readNotifications(memberId: string, ids?: string[]) {
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(id)))) {
      throw new BadRequestException('ids must contain at most 100 notification IDs');
    }
    return this.prisma.memberNotification.updateMany({ where: { memberId, status: 'UNREAD', ...(ids !== undefined ? { id: { in: ids } } : {}) }, data: { status: 'READ', readAt: new Date() } });
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
          firstName: dto.firstName !== undefined ? toPascalCase(text(dto.firstName, 80, 'first name')) : undefined,
          middleName: dto.middleName !== undefined ? (text(dto.middleName, 80, 'middle name') ? toPascalCase(text(dto.middleName, 80, 'middle name')) : null) : undefined,
          lastName: dto.lastName !== undefined ? toPascalCase(text(dto.lastName, 80, 'last name')) : undefined,
          preferredName: dto.preferredName !== undefined ? (text(dto.preferredName, 80, 'preferred name') ? toPascalCase(text(dto.preferredName, 80, 'preferred name')) : null) : undefined,
          phoneNumber: phone ?? undefined,
          alternatePhoneNumber: alternatePhone,
          address: text(dto.address, 300, 'address'),
          city: text(dto.city, 100, 'city'),
          state: text(dto.state, 100, 'state'),
          country: text(dto.country, 100, 'country'),
          postalCode: text(dto.postalCode, 20, 'postal code'),
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
      const created = await this.prisma.member.create({
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
      this.cache.invalidateTags(['members', 'leaderboard', 'dashboard']);
      return created;
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
      }).then((res) => {
        this.cache.invalidateTags(['members', 'leaderboard', 'dashboard']);
        return res;
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
    const updated = await this.updateSelfProfile(id, { ...dto }, { subTeamId: dto.subTeamId, roleInUnit: dto.roleInUnit, status: dto.status });
    this.cache.invalidateTags(['members', 'leaderboard', 'dashboard']);
    return updated;
  }

  async createSubTeam(dto: { name: string; description?: string }) {
    const name = dto.name?.trim();
    if (!name || name.length < 2) throw new BadRequestException('Sub-team name must be at least 2 characters');
    const existing = await this.prisma.subTeam.findUnique({
      where: { name },
    });
    if (existing) {
      throw new ConflictException('Sub-team with this name already exists');
    }

    return this.prisma.subTeam.create({ data: { name, description: dto.description?.trim() || null } });
  }

  async updateSubTeam(id: string, dto: { name?: string; description?: string; active?: boolean }) {
    const subTeam = await this.prisma.subTeam.findUnique({ where: { id } });
    if (!subTeam) throw new NotFoundException('Sub-team not found');

    const data: any = {};
    if (typeof dto.name === 'string' && dto.name.trim()) {
      const name = dto.name.trim();
      const existing = await this.prisma.subTeam.findUnique({ where: { name } });
      if (existing && existing.id !== id) throw new ConflictException('A sub-team with this name already exists');
      data.name = name;
    }
    if (typeof dto.description === 'string') data.description = dto.description.trim() || null;
    if (typeof dto.active === 'boolean') data.active = dto.active;

    return this.prisma.subTeam.update({ where: { id }, data });
  }

  async deleteSubTeam(id: string) {
    const subTeam = await this.prisma.subTeam.findUnique({
      where: { id },
      include: { _count: { select: { members: true } } },
    });
    if (!subTeam) throw new NotFoundException('Sub-team not found');
    if (subTeam.isSystem) throw new BadRequestException('System sub-teams cannot be deleted');
    if (subTeam._count.members > 0) throw new BadRequestException('Cannot delete sub-team with active assigned members');

    return this.prisma.subTeam.delete({ where: { id } });
  }

  async getSubTeams() {
    return this.prisma.subTeam.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } } },
    });
  }

  async inviteMember(memberId: string, actorUserId: string) {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      include: { approvedMember: true, user: true },
    });
    if (!member) throw new NotFoundException('Member not found');

    let approved = member.approvedMember;
    if (!approved) {
      const email = member.user?.email;
      if (email) {
        const normalizedEmail = email.trim().toLowerCase();
        approved = await this.prisma.approvedMember.findUnique({ where: { normalizedEmail } });
        if (approved && !approved.memberId) {
          await this.prisma.approvedMember.update({
            where: { id: approved.id },
            data: { memberId: member.id },
          });
        }
      }
    }

    if (!approved) {
      throw new BadRequestException(
        'This member is not present in the church member lookup table and cannot be invited. Invitations are strictly for pre-approved members on the lookup roster.',
      );
    }

    if (approved.status !== 'ACTIVE') {
      throw new BadRequestException(
        'This member\'s lookup directory status is revoked or inactive and cannot receive platform invitations.',
      );
    }

    return this.lookupsService.inviteOneApprovedMember(approved.id, actorUserId);
  }

  async inviteCandidateByEmailOrId(
    dto: {
      ids?: string[];
      approvedMemberIds?: string[];
      id?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
    },
    actorUserId: string,
  ) {
    const batchIds = dto.ids || dto.approvedMemberIds;
    if (Array.isArray(batchIds) && batchIds.length > 0) {
      return this.lookupsService.inviteSelectedApprovedMembers(batchIds, actorUserId);
    }

    if (dto.id) {
      // Check if it's an approved member ID first, or member profile ID
      const approved = await this.prisma.approvedMember.findUnique({ where: { id: dto.id } });
      if (approved) {
        return this.lookupsService.inviteOneApprovedMember(approved.id, actorUserId);
      }
      return this.inviteMember(dto.id, actorUserId);
    }

    const email = dto.email?.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      throw new BadRequestException('A valid email address or candidate ID is required to send an invitation.');
    }

    const approved = await this.prisma.approvedMember.findUnique({
      where: { normalizedEmail: email },
      include: { member: { include: { user: true } } },
    });

    if (!approved || approved.status !== 'ACTIVE') {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'EMAIL_NOT_IN_LOOKUP_TABLE',
        message: 'This person is not in the church member lookup table and is not eligible for platform invitation. Only pre-approved directory members can be invited.',
      });
    }

    return this.lookupsService.inviteOneApprovedMember(approved.id, actorUserId);
  }
}
