import { occurrences, SERVICE_SCHEDULES } from '../src/modules/recurring-services/service-schedules';
import { RecurringServicesService } from '../src/modules/recurring-services/recurring-services.service';

describe('Recurring services', () => {
  it('matches all ten supplied sessions, with unknown children end times preserved', () => {
    expect(SERVICE_SCHEDULES).toHaveLength(10);
    expect(SERVICE_SCHEDULES.filter(s => s.dayOfWeek === 0)).toHaveLength(8);
    expect(SERVICE_SCHEDULES.filter(s => s.endMinutes === null)).toHaveLength(3);
    const first = occurrences(SERVICE_SCHEDULES[0], new Date('2026-09-09T00:00:00Z'));
    expect(first).toHaveLength(4);
    expect(first[0].startTime.toISOString()).toBe('2026-09-13T06:00:00.000Z');
    expect(first[0].endTime!.toISOString()).toBe('2026-09-13T07:00:00.000Z');
    expect(occurrences(SERVICE_SCHEDULES[8], new Date('2026-09-09T00:00:00Z'))[0].startTime.toISOString()).toBe('2026-09-15T17:45:00.000Z');
  });
  it('never generates an already-started occurrence', () => {
    expect(occurrences(SERVICE_SCHEDULES[0], new Date('2026-09-13T06:00:00Z'))[0].startTime.toISOString()).toBe('2026-09-20T06:00:00.000Z');
  });
  it('does not generate meetings or email until venue and reminder settings exist', async () => {
    const db = { systemSetting: { findUnique: jest.fn().mockResolvedValue(null) } };
    const mail = { sendEmail: jest.fn() };
    const service = new RecurringServicesService(db as any, mail as any, { record: jest.fn() } as any);
    expect(await service.generateUpcoming()).toEqual({ created: 0, configured: false });
    expect(await service.sendDueReminders()).toEqual({ sent: 0 });
    expect(mail.sendEmail).not.toHaveBeenCalled();
  });
  it('claims each recipient/reminder once and skips repeat job runs', async () => {
    const config = { venue: { name: 'Venue', latitude: 6, longitude: 3, radiusMeters: 100 }, arrivalMinutesBefore: 30, reminderMinutes: [60], recipients: 'all', remindersEnabled: true };
    const now = new Date('2026-09-13T05:00:00Z');
    const claims = new Set<string>();
    const db = {
      systemSetting: { findUnique: jest.fn().mockResolvedValue({ value: JSON.stringify(config) }) },
      meeting: { findMany: jest.fn().mockResolvedValue([{ id: 'meeting', title: 'First Service', startTime: new Date('2026-09-13T06:00:00Z'), expectedArrivalTime: new Date('2026-09-13T05:30:00Z'), locationName: 'Venue' }]), count: jest.fn().mockResolvedValue(1) },
      approvedMember: { findMany: jest.fn().mockResolvedValue([{ id: 'approved', memberId: 'member', normalizedEmail: 'member@example.test', member: { firstName: 'Member' } }]), count: jest.fn().mockResolvedValue(1) },
      memberNotification: { create: jest.fn().mockResolvedValue({ id: 'notification' }) },
      communicationDelivery: { createMany: jest.fn(async ({ data }) => { const key = data[0].idempotencyKey; if (claims.has(key)) return { count: 0 }; claims.add(key); return { count: 1 }; }), update: jest.fn() },
    };
    const mail = { sendEmail: jest.fn().mockResolvedValue({ messageId: 'sent' }) };
    const service = new RecurringServicesService(db as any, mail as any, { record: jest.fn() } as any);
    expect(await service.sendDueReminders(now)).toEqual({ sent: 1 });
    expect(await service.sendDueReminders(now)).toEqual({ sent: 0 });
    expect(mail.sendEmail).toHaveBeenCalledTimes(1);
    expect(mail.sendEmail.mock.calls[0][0].text).toContain('Africa/Lagos');
    expect(db.communicationDelivery.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'SENT', providerRef: 'sent' } }));
  });
});
