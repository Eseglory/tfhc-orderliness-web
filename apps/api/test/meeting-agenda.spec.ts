import { MeetingsService } from '../src/modules/meetings/meetings.service';

describe('Meeting Agenda & Online Operations Suite', () => {
  let service: MeetingsService;
  let mockPrisma: any;
  let mockAudit: any;
  let mockCache: any;

  beforeEach(() => {
    mockPrisma = {
      meeting: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      meetingAgendaItem: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((promises) => Promise.all(promises)),
    };

    mockAudit = {
      record: jest.fn().mockResolvedValue(true),
    };

    mockCache = {
      invalidateTags: jest.fn(),
    };

    const mockAbsence: any = {};

    service = new MeetingsService(mockPrisma, mockAbsence, mockAudit, mockCache);
  });

  describe('Agenda CRUD Operations', () => {
    const meetingId = 'test-meeting-id';

    it('getAgenda returns all items ordered by order asc with assigned member', async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ id: meetingId, title: 'Wednesday Unit Weekly Meeting' });
      mockPrisma.meetingAgendaItem.findMany.mockResolvedValue([
        { id: 'item-1', order: 1, title: 'Opening prayer', assignedMember: { firstName: 'Loveth', lastName: 'Ukabuike' } },
        { id: 'item-2', order: 2, title: 'Praise worship', assignedMember: { firstName: 'Mercy', lastName: 'Ogbeide' } },
      ]);

      const result = await service.getAgenda(meetingId);
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Opening prayer');
      expect(mockPrisma.meetingAgendaItem.findMany).toHaveBeenCalledWith({
        where: { meetingId },
        orderBy: { order: 'asc' },
        include: expect.any(Object),
      });
    });

    it('createAgendaItem automatically computes next order if not supplied', async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ id: meetingId });
      mockPrisma.meetingAgendaItem.findFirst.mockResolvedValue({ order: 4 });
      mockPrisma.meetingAgendaItem.create.mockImplementation(({ data }) => Promise.resolve({ id: 'item-5', ...data }));

      const newItem = await service.createAgendaItem(meetingId, {
        title: 'Finance',
        description: 'Financial update',
        durationMinutes: 10,
        assignedMemberId: 'member-ese',
      });

      expect(newItem.order).toBe(5);
      expect(newItem.title).toBe('Finance');
      expect(mockCache.invalidateTags).toHaveBeenCalledWith(['calendar', 'meetings']);
    });

    it('updateAgendaItem updates title, duration, and assigned member', async () => {
      mockPrisma.meetingAgendaItem.findFirst.mockResolvedValue({ id: 'item-3', meetingId });
      mockPrisma.meetingAgendaItem.update.mockResolvedValue({
        id: 'item-3',
        title: 'Exhortation & Sharing',
        durationMinutes: 20,
      });

      const updated = await service.updateAgendaItem(meetingId, 'item-3', {
        title: 'Exhortation & Sharing',
        durationMinutes: 20,
      });

      expect(updated.title).toBe('Exhortation & Sharing');
      expect(updated.durationMinutes).toBe(20);
    });

    it('deleteAgendaItem removes item from database', async () => {
      mockPrisma.meetingAgendaItem.findFirst.mockResolvedValue({ id: 'item-2', meetingId });
      mockPrisma.meetingAgendaItem.delete.mockResolvedValue({ id: 'item-2' });

      const res = await service.deleteAgendaItem(meetingId, 'item-2');
      expect(res.success).toBe(true);
      expect(res.deletedId).toBe('item-2');
    });

    it('reorderAgendaItems batch updates orders in transaction', async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({ id: meetingId });
      mockPrisma.meetingAgendaItem.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.meetingAgendaItem.findMany.mockResolvedValue([
        { id: 'item-2', order: 1 },
        { id: 'item-1', order: 2 },
      ]);

      const res = await service.reorderAgendaItems(meetingId, [
        { id: 'item-2', order: 1 },
        { id: 'item-1', order: 2 },
      ]);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(res[0].id).toBe('item-2');
    });
  });

  describe('Online Meeting Operations Hub', () => {
    it('updateMeetingUrl sets meetingUrl and guarantees isOnline is true', async () => {
      const meetingId = 'online-meeting-1';
      mockPrisma.meeting.findUnique.mockResolvedValue({ id: meetingId });
      mockPrisma.meeting.update.mockResolvedValue({
        id: meetingId,
        meetingUrl: 'https://meet.google.com/ord-tfhc-wed',
        isOnline: true,
      });

      const res = await service.updateMeetingUrl(meetingId, 'https://meet.google.com/ord-tfhc-wed');
      expect(res.success).toBe(true);
      expect(res.meetingUrl).toBe('https://meet.google.com/ord-tfhc-wed');
      expect(res.isOnline).toBe(true);
      expect(mockCache.invalidateTags).toHaveBeenCalledWith(['calendar', 'meetings']);
    });
  });
});
