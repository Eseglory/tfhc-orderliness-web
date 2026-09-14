import { Injectable, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ServiceCategory, AppointmentMode } from '@prisma/client';

export interface CreateServiceDto {
  name: string;
  description?: string;
  category?: ServiceCategory;
  durationMinutes?: number;
  price?: number;
  currency?: string;
  capacity?: number;
  isBookable?: boolean;
  active?: boolean;
  locationType?: AppointmentMode;
  defaultLocation?: string;
  instructions?: string;
  assignedStaffIds?: string[];
}

export interface UpdateServiceDto extends Partial<CreateServiceDto> {}

@Injectable()
export class ServicesService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaultsIfEmpty();
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async findAll(params?: {
    search?: string;
    category?: ServiceCategory;
    activeOnly?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(params?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params?.limit) || 25));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params?.activeOnly) {
      where.active = true;
    }
    if (params?.category) {
      where.category = params.category;
    }
    if (params?.search) {
      const q = params.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { defaultLocation: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.organizationService.count({ where }),
      this.prisma.organizationService.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        include: {
          _count: {
            select: { appointments: true },
          },
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findById(id: string) {
    const service = await this.prisma.organizationService.findUnique({
      where: { id },
      include: {
        _count: {
          select: { appointments: true },
        },
      },
    });
    if (!service) {
      throw new NotFoundException(`Service offering not found`);
    }
    return service;
  }

  async create(dto: CreateServiceDto, userId?: string) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Service name is required');
    }

    let slug = this.slugify(dto.name);
    const existing = await this.prisma.organizationService.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    return this.prisma.organizationService.create({
      data: {
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim() || null,
        category: dto.category || ServiceCategory.CONSULTATION,
        durationMinutes: dto.durationMinutes ? Math.max(5, Number(dto.durationMinutes)) : 30,
        price: dto.price ? Math.max(0, Number(dto.price)) : 0,
        currency: dto.currency || 'NGN',
        capacity: dto.capacity ? Math.max(1, Number(dto.capacity)) : 1,
        isBookable: dto.isBookable !== undefined ? dto.isBookable : true,
        active: dto.active !== undefined ? dto.active : true,
        locationType: dto.locationType || AppointmentMode.IN_PERSON,
        defaultLocation: dto.defaultLocation?.trim() || null,
        instructions: dto.instructions?.trim() || null,
        assignedStaffIds: dto.assignedStaffIds || [],
        createdById: userId || null,
      },
    });
  }

  async update(id: string, dto: UpdateServiceDto) {
    await this.findById(id);

    const data: any = {};
    if (dto.name !== undefined) {
      data.name = dto.name.trim();
      data.slug = this.slugify(dto.name);
    }
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.durationMinutes !== undefined) data.durationMinutes = Math.max(5, Number(dto.durationMinutes));
    if (dto.price !== undefined) data.price = Math.max(0, Number(dto.price));
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.capacity !== undefined) data.capacity = Math.max(1, Number(dto.capacity));
    if (dto.isBookable !== undefined) data.isBookable = dto.isBookable;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.locationType !== undefined) data.locationType = dto.locationType;
    if (dto.defaultLocation !== undefined) data.defaultLocation = dto.defaultLocation?.trim() || null;
    if (dto.instructions !== undefined) data.instructions = dto.instructions?.trim() || null;
    if (dto.assignedStaffIds !== undefined) data.assignedStaffIds = dto.assignedStaffIds;

    return this.prisma.organizationService.update({
      where: { id },
      data,
    });
  }

  async toggleStatus(id: string, active: boolean) {
    await this.findById(id);
    return this.prisma.organizationService.update({
      where: { id },
      data: { active },
    });
  }

  async delete(id: string) {
    const service = await this.findById(id);
    if (service._count?.appointments > 0) {
      return this.prisma.organizationService.update({
        where: { id },
        data: { active: false, isBookable: false },
      });
    }
    return this.prisma.organizationService.delete({ where: { id } });
  }

  private async seedDefaultsIfEmpty() {
    try {
      const count = await this.prisma.organizationService.count();
      if (count > 0) return;

      const defaultServices: CreateServiceDto[] = [
        {
          name: 'Executive Leadership Advisory',
          description: 'Strategic consultation and leadership guidance session with executive personnel.',
          category: ServiceCategory.ADVISORY,
          durationMinutes: 45,
          price: 0,
          capacity: 1,
          isBookable: true,
          active: true,
          locationType: AppointmentMode.IN_PERSON,
          defaultLocation: 'Executive Boardroom / Suite 201',
          instructions: 'Please bring relevant agenda items and briefing notes.',
        },
        {
          name: 'Member Support & Guidance Session',
          description: 'One-on-one confidential personal guidance, welfare check-in, and member support.',
          category: ServiceCategory.COUNSELING,
          durationMinutes: 60,
          price: 0,
          capacity: 1,
          isBookable: true,
          active: true,
          locationType: AppointmentMode.IN_PERSON,
          defaultLocation: 'Consultation Room A',
          instructions: 'Confidential session with dedicated member coordinator.',
        },
        {
          name: 'Technical Logistics & Operations Review',
          description: 'Coordination meeting for technical infrastructure, audio/visual setup, and event logistics.',
          category: ServiceCategory.TECHNICAL,
          durationMinutes: 30,
          price: 0,
          capacity: 5,
          isBookable: true,
          active: true,
          locationType: AppointmentMode.IN_PERSON,
          defaultLocation: 'Control Room & Logistics Hub',
        },
        {
          name: 'Facility & Equipment Reservation Intake',
          description: 'Booking review for facility rooms, multimedia resources, and organizational equipment.',
          category: ServiceCategory.FACILITY,
          durationMinutes: 30,
          price: 0,
          capacity: 1,
          isBookable: true,
          active: true,
          locationType: AppointmentMode.IN_PERSON,
          defaultLocation: 'Operations Desk',
        },
        {
          name: 'Virtual Strategy Consultation (Google Meet)',
          description: 'Online remote video consultation for project coordination and operational planning.',
          category: ServiceCategory.CONSULTATION,
          durationMinutes: 45,
          price: 0,
          capacity: 3,
          isBookable: true,
          active: true,
          locationType: AppointmentMode.VIDEO_CONFERENCE,
          defaultLocation: 'Google Meet',
          instructions: 'Meeting link generated automatically upon appointment confirmation.',
        },
      ];

      for (const s of defaultServices) {
        await this.create(s);
      }
    } catch (e) {
      console.warn('Could not auto-seed default services', e);
    }
  }
}
