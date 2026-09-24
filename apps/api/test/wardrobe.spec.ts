import { WardrobeService } from '../src/modules/wardrobe/wardrobe.service';
import { WardrobeAdminService } from '../src/modules/wardrobe/wardrobe-admin.service';
import { NotFoundException } from '@nestjs/common';

describe('Wardrobe Domain Logic & Deterministic Scheduling (Unit Tests)', () => {
  let wardrobeService: WardrobeService;
  let adminService: WardrobeAdminService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      wardrobeItem: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      wardrobeItemVariant: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      wardrobeOutfit: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      wardrobeOutfitItem: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      wardrobeSchedule: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    wardrobeService = new WardrobeService(prisma as any);
    adminService = new WardrobeAdminService(prisma as any);
  });

  describe('1. Deterministic NEXT WARDROBE Resolution', () => {
    it('queries published schedules with scheduledDate >= cutoff and orders by scheduledDate ASC', async () => {
      const fixedNow = new Date('2026-09-16T10:00:00.000Z'); // Wednesday
      const expectedSchedule = {
        id: 'friday-special',
        title: 'Youth Convention Friday Opening',
        scheduledDate: new Date('2026-09-18T17:00:00.000Z'),
        status: 'PUBLISHED',
        outfit: {
          id: 'outfit-native',
          title: 'African Senator Native',
          items: [
            {
              id: 'comp-1',
              layerOrder: 1,
              item: { id: 'item-1', name: 'Senator Native' },
              variant: { id: 'var-1', colorName: 'Emerald Green', colorCode: '#50C878' },
            },
          ],
        },
      };

      prisma.wardrobeSchedule.findFirst.mockResolvedValue(expectedSchedule);

      const result = await wardrobeService.getNextWardrobe(fixedNow);

      expect(prisma.wardrobeSchedule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PUBLISHED',
          }),
          orderBy: { scheduledDate: 'asc' },
        }),
      );
      expect(result).toEqual(expectedSchedule);
      expect(result?.title).toBe('Youth Convention Friday Opening');
    });

    it('returns null if no published upcoming wardrobe schedules exist', async () => {
      prisma.wardrobeSchedule.findFirst.mockResolvedValue(null);
      const result = await wardrobeService.getNextWardrobe();
      expect(result).toBeNull();
    });
  });

  describe('2. Catalogue & Color Variants Management', () => {
    it('creates a clothing item with uppercase category and trimmed title', async () => {
      const itemDto = {
        name: ' Two-Piece Suit ',
        category: 'suit',
        description: ' Classic tailored suit ',
        gender: 'ALL',
      };

      const created = { id: 'item-1', name: 'Two-Piece Suit', category: 'SUIT', description: 'Classic tailored suit', gender: 'ALL', active: true };
      prisma.wardrobeItem.create.mockResolvedValue(created);

      const res = await adminService.createItem(itemDto);

      expect(prisma.wardrobeItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Two-Piece Suit',
          category: 'SUIT',
          description: 'Classic tailored suit',
        }),
        include: { variants: true },
      });
      expect(res).toMatchObject(created);
    });

    it('creates color variants linked to the item', async () => {
      prisma.wardrobeItem.findUnique.mockResolvedValue({ id: 'item-1', name: 'Suit' });
      const variantDto = {
        colorName: ' Royal Navy ',
        colorCode: ' #1B2A4A ',
      };

      const createdVariant = { id: 'var-1', itemId: 'item-1', colorName: 'Royal Navy', colorCode: '#1B2A4A', active: true };
      prisma.wardrobeItemVariant.create.mockResolvedValue(createdVariant);

      const res = await adminService.createVariant('item-1', variantDto);

      expect(prisma.wardrobeItemVariant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          itemId: 'item-1',
          colorName: 'Royal Navy',
          colorCode: '#1B2A4A',
        }),
      });
      expect(res).toEqual(createdVariant);
    });
  });

  describe('3. Visual Outfit Builder', () => {
    it('creates a layered outfit with item and variant links', async () => {
      const outfitDto = {
        title: 'Sunday Royal Navy Formal',
        description: 'Complete formal Sunday service wear',
        genderTarget: 'ALL',
        isTemplate: true,
        items: [
          { itemId: 'shirt-1', variantId: 'white-var', layerOrder: 1, required: true },
          { itemId: 'suit-1', variantId: 'navy-var', layerOrder: 2, required: true },
        ],
      };

      const createdOutfit = { id: 'outfit-1', title: 'Sunday Royal Navy Formal' };
      prisma.wardrobeOutfit.create.mockResolvedValue(createdOutfit);
      prisma.wardrobeOutfit.findUnique.mockResolvedValue({
        ...createdOutfit,
        items: [
          { id: 'oi-1', itemId: 'shirt-1', variantId: 'white-var', layerOrder: 1 },
          { id: 'oi-2', itemId: 'suit-1', variantId: 'navy-var', layerOrder: 2 },
        ],
      });

      const res = await adminService.createOutfit(outfitDto, 'user-admin-1');

      expect(prisma.wardrobeOutfit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Sunday Royal Navy Formal',
          isTemplate: true,
          createdById: 'user-admin-1',
        }),
      });
      expect(prisma.wardrobeOutfitItem.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ itemId: 'shirt-1', variantId: 'white-var', layerOrder: 1 }),
          expect.objectContaining({ itemId: 'suit-1', variantId: 'navy-var', layerOrder: 2 }),
        ]),
      });
      expect(res?.items.length).toBe(2);
    });
  });

  describe('4. Monthly Sunday Generator & Draft vs. Published', () => {
    it('generates all Sunday schedule entries for a given month in DRAFT state', async () => {
      prisma.wardrobeOutfit.findUnique.mockResolvedValue({ id: 'outfit-1', title: 'Sunday Formal' });
      prisma.wardrobeSchedule.findFirst.mockResolvedValue(null); // No existing schedules on those days
      prisma.wardrobeSchedule.create.mockImplementation(({ data }) => Promise.resolve({ id: 'sched-' + Math.random(), ...data }));

      // October 2026 has 4 Sundays: Oct 4, 11, 18, 25
      const res = await adminService.generateMonthlySundays({
        year: 2026,
        month: 10,
        defaultOutfitId: 'outfit-1',
        initialStatus: 'DRAFT',
      }, 'admin-1');

      expect(res.count).toBe(4);
      expect(prisma.wardrobeSchedule.create).toHaveBeenCalledTimes(4);
    });

    it('toggles publish status on a schedule', async () => {
      prisma.wardrobeSchedule.findUnique.mockResolvedValue({ id: 'sched-1', status: 'DRAFT' });
      prisma.wardrobeSchedule.update.mockResolvedValue({ id: 'sched-1', status: 'PUBLISHED' });

      const updated = await adminService.setPublishStatus('sched-1', true);

      expect(prisma.wardrobeSchedule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sched-1' },
          data: { status: 'PUBLISHED' },
        }),
      );
      expect(updated.status).toBe('PUBLISHED');
    });
  });
});
