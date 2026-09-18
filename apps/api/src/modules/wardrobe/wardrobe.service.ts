import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WardrobeService {
  constructor(private prisma: PrismaService) {}

  /**
   * Deterministic NEXT WARDROBE resolution:
   * Finds the earliest published wardrobe schedule where:
   * - scheduledDate is today or in the future (or within today's ongoing event window)
   * - status = 'PUBLISHED'
   * ORDER BY scheduledDate ASC, taking the 1st match.
   */
  async getNextWardrobe(now = new Date()) {
    // Look for published wardrobe schedules that haven't ended yet
    // (grace period: 2 hours after scheduled start if no explicit endDate)
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60000);

    const nextSchedule = await this.prisma.wardrobeSchedule.findFirst({
      where: {
        status: 'PUBLISHED',
        OR: [
          { endDate: { gte: now } },
          { endDate: null, scheduledDate: { gte: twoHoursAgo } },
        ],
      },
      include: {
        outfit: {
          include: {
            items: {
              include: {
                item: true,
                variant: true,
              },
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

    return nextSchedule;
  }

  /**
   * Get upcoming published wardrobe schedules for members
   */
  async getUpcomingSchedules(options?: { month?: string; limit?: number; now?: Date; all?: boolean }) {
    const now = options?.now || new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60000);

    const where: any = {
      status: 'PUBLISHED',
    };

    if (options?.all) {
      // Return all published schedules across all dates (for the full roster timetable view)
    } else if (options?.month) {
      // month formatted as 'YYYY-MM'
      const [year, month] = options.month.split('-').map(Number);
      const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      where.scheduledDate = { gte: startOfMonth, lte: endOfMonth };
    } else {
      where.OR = [
        { endDate: { gte: now } },
        { endDate: null, scheduledDate: { gte: twoHoursAgo } },
      ];
    }

    return this.prisma.wardrobeSchedule.findMany({
      where,
      include: {
        outfit: {
          include: {
            items: {
              include: {
                item: true,
                variant: true,
              },
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
      take: options?.limit || 20,
    });
  }

  /**
   * Get full outfit details
   */
  async getOutfitDetails(id: string) {
    const outfit = await this.prisma.wardrobeOutfit.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            item: true,
            variant: true,
          },
          orderBy: { layerOrder: 'asc' },
        },
        schedules: {
          where: { status: 'PUBLISHED' },
          orderBy: { scheduledDate: 'asc' },
          take: 5,
        },
      },
    });

    if (!outfit) throw new NotFoundException('Outfit not found');
    return outfit;
  }

  /**
   * Get active clothing catalogue items and their variants
   */
  async getCatalogue(category?: string) {
    return this.prisma.wardrobeItem.findMany({
      where: {
        active: true,
        ...(category ? { category } : {}),
      },
      include: {
        variants: {
          where: { active: true },
          orderBy: [{ sortOrder: 'asc' }, { colorName: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { category: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Get all active clothing categories (seeded & custom)
   */
  async getCategories() {
    return this.prisma.wardrobeCategory.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Get all active clothing colors/palette (seeded & custom)
   */
  async getColors() {
    return this.prisma.wardrobeColor.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }
}

