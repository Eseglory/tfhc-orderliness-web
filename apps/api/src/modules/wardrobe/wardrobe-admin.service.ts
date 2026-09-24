import { Injectable, NotFoundException, BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import sharp from 'sharp';
import {
  CreateWardrobeItemDto,
  UpdateWardrobeItemDto,
  CreateWardrobeVariantDto,
  UpdateWardrobeVariantDto,
  CreateWardrobeOutfitDto,
  UpdateWardrobeOutfitDto,
  CreateWardrobeScheduleDto,
  UpdateWardrobeScheduleDto,
  GenerateMonthlySundaysDto,
  CreateWardrobeCategoryDto,
  UpdateWardrobeCategoryDto,
  CreateWardrobeColorDto,
  UpdateWardrobeColorDto,
} from './wardrobe.dto';


@Injectable()
export class WardrobeAdminService {
  constructor(private prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // 1. Catalogue Items
  // ---------------------------------------------------------------------------

  async listItems(query?: { category?: string; search?: string; activeOnly?: boolean }) {
    return this.prisma.wardrobeItem.findMany({
      where: {
        ...(query?.category ? { category: query.category } : {}),
        ...(query?.activeOnly ? { active: true } : {}),
        ...(query?.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { category: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        variants: {
          orderBy: [{ sortOrder: 'asc' }, { colorName: 'asc' }],
        },
        _count: { select: { outfitItems: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { category: 'asc' }, { name: 'asc' }],
    });
  }

  async getItem(id: string) {
    const item = await this.prisma.wardrobeItem.findUnique({
      where: { id },
      include: {
        variants: { orderBy: [{ sortOrder: 'asc' }, { colorName: 'asc' }] },
        outfitItems: {
          include: {
            outfit: true,
          },
          take: 10,
        },
      },
    });
    if (!item) throw new NotFoundException('Wardrobe item not found');
    return {
      ...item,
      notes: item.description ?? null,
    };
  }

  async createItem(dto: CreateWardrobeItemDto) {
    const description = (dto.description !== undefined ? dto.description : dto.notes)?.trim();
    const created = await this.prisma.wardrobeItem.create({
      data: {
        name: dto.name.trim(),
        category: dto.category.trim().toUpperCase(),
        description,
        gender: dto.gender || 'ALL',
        imageUrl: dto.imageUrl,
        active: dto.active ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: { variants: true },
    });
    return {
      ...created,
      notes: created.description ?? null,
    };
  }

  async updateItem(id: string, dto: UpdateWardrobeItemDto) {
    await this.getItem(id);
    const description = (dto.description !== undefined ? dto.description : dto.notes)?.trim();
    const updated = await this.prisma.wardrobeItem.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.category ? { category: dto.category.trim().toUpperCase() } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(dto.gender ? { gender: dto.gender } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
      include: { variants: true },
    });
    return {
      ...updated,
      notes: updated.description ?? null,
    };
  }

  async deleteItem(id: string) {
    await this.getItem(id);
    return this.prisma.wardrobeItem.delete({
      where: { id },
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Clothing Variants / Colours
  // ---------------------------------------------------------------------------

  async createVariant(itemId: string, dto: CreateWardrobeVariantDto) {
    await this.getItem(itemId);
    const colorCode = (dto.colorCode || dto.colorHex)?.trim();
    return this.prisma.wardrobeItemVariant.create({
      data: {
        itemId,
        colorName: dto.colorName.trim(),
        colorCode,
        imageUrl: dto.imageUrl,
        active: dto.active ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateVariant(id: string, dto: UpdateWardrobeVariantDto) {
    const variant = await this.prisma.wardrobeItemVariant.findUnique({ where: { id } });
    if (!variant) throw new NotFoundException('Variant not found');
    const colorCode = (dto.colorCode || dto.colorHex)?.trim();

    return this.prisma.wardrobeItemVariant.update({
      where: { id },
      data: {
        ...(dto.colorName ? { colorName: dto.colorName.trim() } : {}),
        ...(colorCode !== undefined ? { colorCode } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async deleteVariant(id: string) {
    const variant = await this.prisma.wardrobeItemVariant.findUnique({ where: { id } });
    if (!variant) throw new NotFoundException('Variant not found');

    return this.prisma.wardrobeItemVariant.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // 3. Image Processing & Optimization (Sharp)
  // ---------------------------------------------------------------------------

  async processAndStoreImage(file?: { buffer: Buffer; size: number }) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose an image file (JPEG, PNG, WebP)');
    if (file.size > 2 * 1024 * 1024 || file.buffer.length > 2 * 1024 * 1024) {
      throw new PayloadTooLargeException('Image must be 2 MB or smaller');
    }

    let output: Buffer;
    try {
      const image = sharp(file.buffer, { limitInputPixels: 25000000, animated: false });
      const metadata = await image.metadata();
      if (!['jpeg', 'png', 'webp', 'avif'].includes(metadata.format || '')) {
        throw new Error('Unsupported image format');
      }
      output = await image
        .rotate()
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new BadRequestException('Provide a valid, non-corrupted JPEG, PNG, or WebP image');
    }

    const imageUrl = `data:image/webp;base64,${output.toString('base64')}`;
    return { imageUrl };
  }

  // ---------------------------------------------------------------------------
  // 4. Visual Outfit Builder & Reusable Templates
  // ---------------------------------------------------------------------------

  async listOutfits(query?: { templatesOnly?: boolean; activeOnly?: boolean; search?: string }) {
    return this.prisma.wardrobeOutfit.findMany({
      where: {
        ...(query?.templatesOnly !== undefined ? { isTemplate: query.templatesOnly } : {}),
        ...(query?.activeOnly ? { active: true } : {}),
        ...(query?.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } },
                { notes: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        items: {
          include: {
            item: true,
            variant: true,
          },
          orderBy: { layerOrder: 'asc' },
        },
        _count: { select: { schedules: true } },
      },
      orderBy: [{ isTemplate: 'desc' }, { title: 'asc' }],
    });
  }

  async getOutfit(id: string) {
    const outfit = await this.prisma.wardrobeOutfit.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            item: { include: { variants: true } },
            variant: true,
          },
          orderBy: { layerOrder: 'asc' },
        },
        schedules: {
          orderBy: { scheduledDate: 'desc' },
          take: 10,
        },
      },
    });
    if (!outfit) throw new NotFoundException('Outfit not found');
    return outfit;
  }

  async createOutfit(dto: CreateWardrobeOutfitDto, creatorUserId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const outfit = await tx.wardrobeOutfit.create({
        data: {
          title: dto.title.trim(),
          description: dto.description?.trim(),
          genderTarget: dto.genderTarget || dto.gender || 'ALL',
          coverImageUrl: dto.coverImageUrl,
          notes: dto.notes?.trim(),
          isTemplate: dto.isTemplate ?? false,
          active: dto.active ?? true,
          createdById: creatorUserId,
        },
      });

      if (dto.items && dto.items.length > 0) {
        await tx.wardrobeOutfitItem.createMany({
          data: dto.items.map((it, idx) => ({
            outfitId: outfit.id,
            itemId: (it.itemId || it.wardrobeItemId)!,
            variantId: it.variantId || null,
            layerOrder: it.layerOrder ?? it.sortOrder ?? idx,
            required: it.required ?? true,
            notes: it.notes?.trim(),
          })),
        });
      }

      return tx.wardrobeOutfit.findUnique({
        where: { id: outfit.id },
        include: {
          items: {
            include: { item: true, variant: true },
            orderBy: { layerOrder: 'asc' },
          },
        },
      });
    });
  }

  async updateOutfit(id: string, dto: UpdateWardrobeOutfitDto) {
    await this.getOutfit(id);

    return this.prisma.$transaction(async (tx) => {
      const genderTarget = dto.genderTarget || dto.gender;
      await tx.wardrobeOutfit.update({
        where: { id },
        data: {
          ...(dto.title ? { title: dto.title.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description?.trim() } : {}),
          ...(genderTarget ? { genderTarget } : {}),
          ...(dto.coverImageUrl !== undefined ? { coverImageUrl: dto.coverImageUrl } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes?.trim() } : {}),
          ...(dto.isTemplate !== undefined ? { isTemplate: dto.isTemplate } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
      });

      if (dto.items !== undefined) {
        await tx.wardrobeOutfitItem.deleteMany({ where: { outfitId: id } });
        if (dto.items.length > 0) {
          await tx.wardrobeOutfitItem.createMany({
            data: dto.items.map((it, idx) => ({
              outfitId: id,
              itemId: (it.itemId || it.wardrobeItemId)!,
              variantId: it.variantId || null,
              layerOrder: it.layerOrder ?? it.sortOrder ?? idx,
              required: it.required ?? true,
              notes: it.notes?.trim(),
            })),
          });
        }
      }

      return tx.wardrobeOutfit.findUnique({
        where: { id: id },
        include: {
          items: {
            include: { item: true, variant: true },
            orderBy: { layerOrder: 'asc' },
          },
        },
      });
    });
  }

  async deleteOutfit(id: string) {
    await this.getOutfit(id);
    return this.prisma.wardrobeOutfit.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // 5. Wardrobe Schedules (Monthly & Special Programs)
  // ---------------------------------------------------------------------------

  async listSchedules(query?: { month?: string; status?: string; eventType?: string }) {
    const where: any = {};

    if (query?.status) {
      where.status = query.status;
    }

    if (query?.eventType) {
      where.eventType = query.eventType;
    }

    if (query?.month) {
      const [year, month] = query.month.split('-').map(Number);
      const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      where.scheduledDate = { gte: startOfMonth, lte: endOfMonth };
    }

    const rows = await this.prisma.wardrobeSchedule.findMany({
      where,
      include: {
        outfit: {
          include: {
            items: {
              include: { item: true, variant: true },
              orderBy: { layerOrder: 'asc' },
            },
          },
        },
        meeting: {
          select: {
            id: true,
            title: true,
            startTime: true,
            locationName: true,
            category: { select: { name: true } },
          },
        },
      },
      orderBy: { scheduledDate: 'asc' },
    });

    return rows.map((s) => ({
      ...s,
      notes: s.instructions ?? (s as any).notes ?? null,
    }));
  }

  async getSchedule(id: string) {
    const schedule = await this.prisma.wardrobeSchedule.findUnique({
      where: { id },
      include: {
        outfit: {
          include: {
            items: {
              include: { item: true, variant: true },
              orderBy: { layerOrder: 'asc' },
            },
          },
        },
        meeting: true,
      },
    });
    if (!schedule) throw new NotFoundException('Schedule not found');
    return {
      ...schedule,
      notes: schedule.instructions ?? (schedule as any).notes ?? null,
    };
  }

  async createSchedule(dto: CreateWardrobeScheduleDto, creatorUserId?: string) {
    await this.getOutfit(dto.outfitId);

    const scheduledDate = new Date(dto.scheduledDate);
    const endDate = dto.endDate ? new Date(dto.endDate) : null;
    const instructions = dto.instructions !== undefined ? dto.instructions?.trim() : dto.notes !== undefined ? dto.notes?.trim() : undefined;

    const created = await this.prisma.wardrobeSchedule.create({
      data: {
        outfitId: dto.outfitId,
        title: dto.title.trim(),
        meetingId: dto.meetingId || null,
        serviceScheduleId: dto.serviceScheduleId || null,
        scheduledDate,
        endDate,
        eventType: dto.eventType || 'SUNDAY_SERVICE',
        status: dto.status || 'PUBLISHED',
        instructions,
        createdById: creatorUserId,
      },
      include: {
        outfit: {
          include: {
            items: {
              include: { item: true, variant: true },
              orderBy: { layerOrder: 'asc' },
            },
          },
        },
        meeting: true,
      },
    });

    return {
      ...created,
      notes: created.instructions ?? null,
    };
  }

  async updateSchedule(id: string, dto: UpdateWardrobeScheduleDto) {
    await this.getSchedule(id);
    if (dto.outfitId) await this.getOutfit(dto.outfitId);
    const instructions = dto.instructions !== undefined ? dto.instructions?.trim() : dto.notes !== undefined ? dto.notes?.trim() : undefined;

    const updated = await this.prisma.wardrobeSchedule.update({
      where: { id },
      data: {
        ...(dto.outfitId ? { outfitId: dto.outfitId } : {}),
        ...(dto.title ? { title: dto.title.trim() } : {}),
        ...(dto.meetingId !== undefined ? { meetingId: dto.meetingId || null } : {}),
        ...(dto.serviceScheduleId !== undefined ? { serviceScheduleId: dto.serviceScheduleId || null } : {}),
        ...(dto.scheduledDate ? { scheduledDate: new Date(dto.scheduledDate) } : {}),
        ...(dto.endDate !== undefined ? { endDate: dto.endDate ? new Date(dto.endDate) : null } : {}),
        ...(dto.eventType ? { eventType: dto.eventType } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(instructions !== undefined ? { instructions } : {}),
      },
      include: {
        outfit: {
          include: {
            items: {
              include: { item: true, variant: true },
              orderBy: { layerOrder: 'asc' },
            },
          },
        },
        meeting: true,
      },
    });

    return {
      ...updated,
      notes: updated.instructions ?? null,
    };
  }

  async setPublishStatus(id: string, publish: boolean) {
    await this.getSchedule(id);
    return this.prisma.wardrobeSchedule.update({
      where: { id },
      data: { status: publish ? 'PUBLISHED' : 'DRAFT' },
      include: { outfit: true, meeting: true },
    });
  }

  async deleteSchedule(id: string) {
    await this.getSchedule(id);
    return this.prisma.wardrobeSchedule.delete({ where: { id } });
  }

  /**
   * Bulk Monthly Sunday Timetable Generator:
   * Finds all Sundays in the given year/month and creates schedule slots.
   */
  async generateMonthlySundays(dto: GenerateMonthlySundaysDto, creatorUserId?: string) {
    const targetOutfitId = dto.defaultOutfitId || dto.outfitId;
    if (!targetOutfitId) throw new BadRequestException('Please specify an outfit');
    const outfit = await this.getOutfit(targetOutfitId);
    const { year, month } = dto;
    const initialStatus = dto.status || dto.initialStatus || 'DRAFT';

    const sundays: Date[] = [];
    const date = new Date(Date.UTC(year, month - 1, 1, 8, 0, 0));

    while (date.getUTCMonth() === month - 1) {
      if (date.getUTCDay() === 0) { // 0 = Sunday
        sundays.push(new Date(date));
      }
      date.setUTCDate(date.getUTCDate() + 1);
    }

    const created: any[] = [];
    for (let i = 0; i < sundays.length; i++) {
      const sun = sundays[i];
      const title = `Sunday Service (${i + 1}${getOrdinal(i + 1)} Sunday) - ${outfit.title}`;

      // Check if a schedule already exists on this day
      const dayStart = new Date(Date.UTC(sun.getUTCFullYear(), sun.getUTCMonth(), sun.getUTCDate(), 0, 0, 0));
      const dayEnd = new Date(Date.UTC(sun.getUTCFullYear(), sun.getUTCMonth(), sun.getUTCDate(), 23, 59, 59));

      const existing = await this.prisma.wardrobeSchedule.findFirst({
        where: {
          scheduledDate: { gte: dayStart, lte: dayEnd },
          eventType: 'SUNDAY_SERVICE',
        },
      });

      if (!existing) {
        const schedule = await this.prisma.wardrobeSchedule.create({
          data: {
            outfitId: outfit.id,
            title,
            scheduledDate: sun,
            eventType: 'SUNDAY_SERVICE',
            status: initialStatus,
            createdById: creatorUserId,
          },
        });
        created.push(schedule);
      }
    }

    return {
      message: `Generated ${created.length} Sunday schedule(s) for ${year}-${String(month).padStart(2, '0')}`,
      count: created.length,
      schedules: created,
    };
  }

  // ---------------------------------------------------------------------------
  // 5. Categories Reference Data Management
  // ---------------------------------------------------------------------------

  async listCategories(query?: { activeOnly?: boolean; search?: string }) {
    return this.prisma.wardrobeCategory.findMany({
      where: {
        ...(query?.activeOnly ? { active: true } : {}),
        ...(query?.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { key: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async getCategory(id: string) {
    const category = await this.prisma.wardrobeCategory.findUnique({
      where: { id },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async createCategory(dto: CreateWardrobeCategoryDto) {
    const key = (dto.key || dto.name)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_');

    const existing = await this.prisma.wardrobeCategory.findFirst({
      where: { OR: [{ key }, { name: { equals: dto.name, mode: 'insensitive' } }] },
    });
    if (existing) {
      throw new BadRequestException(`Category "${dto.name}" or key "${key}" already exists`);
    }

    return this.prisma.wardrobeCategory.create({
      data: {
        key,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        icon: dto.icon?.trim(),
        sortOrder: dto.sortOrder ?? 100,
        active: dto.active ?? true,
        isSystem: false,
      },
    });
  }

  async updateCategory(id: string, dto: UpdateWardrobeCategoryDto) {
    await this.getCategory(id);
    return this.prisma.wardrobeCategory.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon?.trim() || null } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async deleteCategory(id: string) {
    const category = await this.getCategory(id);
    if (category.isSystem) {
      throw new BadRequestException('System categories cannot be deleted. You may deactivate them instead.');
    }
    return this.prisma.wardrobeCategory.delete({
      where: { id },
    });
  }

  // ---------------------------------------------------------------------------
  // 6. Colors Reference Data Management
  // ---------------------------------------------------------------------------

  async listColors(query?: { activeOnly?: boolean; search?: string }) {
    return this.prisma.wardrobeColor.findMany({
      where: {
        ...(query?.activeOnly ? { active: true } : {}),
        ...(query?.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { key: { contains: query.search, mode: 'insensitive' } },
                { hexCode: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async getColor(id: string) {
    const color = await this.prisma.wardrobeColor.findUnique({
      where: { id },
    });
    if (!color) throw new NotFoundException('Color not found');
    return color;
  }

  async createColor(dto: CreateWardrobeColorDto) {
    const key = (dto.key || dto.name)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_');

    const existing = await this.prisma.wardrobeColor.findFirst({
      where: { OR: [{ key }, { name: { equals: dto.name, mode: 'insensitive' } }] },
    });
    if (existing) {
      throw new BadRequestException(`Color "${dto.name}" or key "${key}" already exists`);
    }

    return this.prisma.wardrobeColor.create({
      data: {
        key,
        name: dto.name.trim(),
        hexCode: dto.hexCode.trim(),
        sortOrder: dto.sortOrder ?? 100,
        active: dto.active ?? true,
        isSystem: false,
      },
    });
  }

  async updateColor(id: string, dto: UpdateWardrobeColorDto) {
    await this.getColor(id);
    return this.prisma.wardrobeColor.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.hexCode ? { hexCode: dto.hexCode.trim() } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async deleteColor(id: string) {
    const color = await this.getColor(id);
    if (color.isSystem) {
      throw new BadRequestException('System colors cannot be deleted. You may deactivate them instead.');
    }
    return this.prisma.wardrobeColor.delete({
      where: { id },
    });
  }
}

function getOrdinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

