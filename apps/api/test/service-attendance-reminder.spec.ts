import { Test, TestingModule } from '@nestjs/testing';
import { ServiceReminderService } from '../src/modules/meetings/service-reminder.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/modules/mail/mail.service';
import { PushService } from '../src/modules/push/push.service';
import { ChatService } from '../src/modules/chat/chat.service';
import { ConfigService } from '@nestjs/config';
import { MeetingStatus, MemberStatus, ServiceCommitmentStatus } from '@prisma/client';

describe('Active Service Reminder for Available Members Suite', () => {
  let serviceReminderService: ServiceReminderService;
  let mockPrisma: any;
  let mockMailService: any;
  let mockPushService: any;
  let mockChatService: any;

  // In-memory store
  let meetings: any[] = [];
  let members: any[] = [];
  let commitments: any[] = [];
  let eventResponses: any[] = [];
  let attendanceRecords: any[] = [];
  let notifications: any[] = [];
  let deliveries: any[] = [];
  let chatRooms: any[] = [];
  let pushSubscriptions: any[] = [];

  beforeEach(async () => {
    // Reset in-memory DB
    meetings = [
      {
        id: 'meeting-sunday',
        title: 'Sunday Service',
        meetingDate: new Date('2026-09-21T00:00:00Z'),
        startTime: new Date('2026-09-21T09:00:00Z'),
        attendanceOpenTime: new Date('2026-09-21T08:30:00Z'),
        attendanceCloseTime: new Date('2026-09-21T11:00:00Z'),
        locationName: 'Main Sanctuary',
        status: MeetingStatus.ACTIVE,
        visibility: 'PUBLIC',
        audiences: [],
      },
      {
        id: 'meeting-midweek',
        title: 'Midweek Communion',
        meetingDate: new Date('2026-09-24T00:00:00Z'),
        startTime: new Date('2026-09-24T18:00:00Z'),
        attendanceOpenTime: new Date('2026-09-24T17:30:00Z'),
        attendanceCloseTime: new Date('2026-09-24T20:00:00Z'),
        locationName: 'Chapel',
        status: MeetingStatus.ACTIVE,
        visibility: 'PUBLIC',
        audiences: [],
      },
      {
        id: 'meeting-cancelled',
        title: 'Cancelled Vigil',
        startTime: new Date('2026-09-25T22:00:00Z'),
        attendanceOpenTime: new Date('2026-09-25T21:30:00Z'),
        attendanceCloseTime: new Date('2026-09-26T04:00:00Z'),
        locationName: 'Main Sanctuary',
        status: MeetingStatus.CANCELLED,
        visibility: 'PUBLIC',
        audiences: [],
      },
    ];

    members = [
      {
        id: 'mem-john',
        firstName: 'John',
        lastName: 'Doe',
        status: MemberStatus.ACTIVE,
        subTeamId: 'team-1',
        roleInUnit: 'MEMBER',
        user: { id: 'user-john', email: 'john@example.com', isActive: true },
        approvedMember: { normalizedEmail: 'john@example.com', status: 'ACTIVE' },
      },
      {
        id: 'mem-jane',
        firstName: 'Jane',
        lastName: 'Smith',
        status: MemberStatus.ACTIVE,
        subTeamId: 'team-1',
        roleInUnit: 'MEMBER',
        user: { id: 'user-jane', email: 'jane@example.com', isActive: true },
        approvedMember: { normalizedEmail: 'jane@example.com', status: 'ACTIVE' },
      },
      {
        id: 'mem-peter',
        firstName: 'Peter',
        lastName: 'Pan',
        status: MemberStatus.ACTIVE,
        subTeamId: 'team-1',
        roleInUnit: 'MEMBER',
        user: { id: 'user-peter', email: 'peter@example.com', isActive: true },
        approvedMember: { normalizedEmail: 'peter@example.com', status: 'ACTIVE' },
      },
      {
        id: 'mem-mary',
        firstName: 'Mary',
        lastName: 'Magdalene',
        status: MemberStatus.ACTIVE,
        subTeamId: 'team-1',
        roleInUnit: 'MEMBER',
        user: { id: 'user-mary', email: 'mary@example.com', isActive: true },
        approvedMember: { normalizedEmail: 'mary@example.com', status: 'ACTIVE' },
      },
      {
        id: 'mem-mark',
        firstName: 'Mark',
        lastName: 'Twain',
        status: MemberStatus.ACTIVE,
        subTeamId: 'team-1',
        roleInUnit: 'MEMBER',
        user: { id: 'user-mark', email: 'mark@example.com', isActive: true },
        approvedMember: { normalizedEmail: 'mark@example.com', status: 'ACTIVE' },
      },
    ];

    commitments = [
      // John -> Available (COMMITTED)
      { id: 'c-1', cycleId: 'cyc-1', memberId: 'mem-john', meetingId: 'meeting-sunday', status: ServiceCommitmentStatus.COMMITTED },
      // Jane -> Available (COMMITTED)
      { id: 'c-2', cycleId: 'cyc-1', memberId: 'mem-jane', meetingId: 'meeting-sunday', status: ServiceCommitmentStatus.COMMITTED },
      // Peter -> Not Available (NOT_COMMITTED)
      { id: 'c-3', cycleId: 'cyc-1', memberId: 'mem-peter', meetingId: 'meeting-sunday', status: ServiceCommitmentStatus.NOT_COMMITTED },
      // Mary -> No commitment/response
      // Mark -> Committed for Sunday, but will attend early
      { id: 'c-4', cycleId: 'cyc-1', memberId: 'mem-mark', meetingId: 'meeting-sunday', status: ServiceCommitmentStatus.COMMITTED },
    ];

    eventResponses = [];
    attendanceRecords = [];
    notifications = [];
    deliveries = [];
    chatRooms = [{ id: 'room-gen', key: 'GENERAL', name: 'General' }];
    pushSubscriptions = [
      { id: 'sub-john', userId: 'user-john', endpoint: 'https://fcm.googleapis.com/fcm/send/john', sessionExpiresAt: new Date(Date.now() + 86400000) },
      { id: 'sub-jane', userId: 'user-jane', endpoint: 'https://fcm.googleapis.com/fcm/send/jane', sessionExpiresAt: new Date(Date.now() + 86400000) },
    ];

    mockMailService = {
      sendEmail: jest.fn(async (opts) => {
        if (opts.to.includes('fail')) throw new Error('SMTP connection timed out');
        return { messageId: `msg-${Date.now()}` };
      }),
    };

    mockPushService = {
      deliver: jest.fn(),
    };

    mockChatService = {
      postSystemMessage: jest.fn(async (roomId, body) => true),
    };

    mockPrisma = {
      meeting: {
        findUnique: jest.fn(async ({ where }) => meetings.find((m) => m.id === where.id) || null),
        findMany: jest.fn(async ({ where }) => {
          return meetings.filter((m) => {
            if (where?.status?.in && !where.status.in.includes(m.status)) return false;
            return true;
          });
        }),
      },
      member: {
        findUnique: jest.fn(async ({ where }) => members.find((m) => m.id === where.id) || null),
        findMany: jest.fn(async ({ where }) => {
          const meetingId = where?.OR ? 'meeting-sunday' : undefined;
          return members.filter((m) => {
            if (m.status !== 'ACTIVE') return false;
            // Filter by attended
            const hasAttended = attendanceRecords.some((a) => a.memberId === m.id && a.meetingId === (where?.attendanceRecords?.none?.meetingId || meetingId));
            if (where?.attendanceRecords?.none && hasAttended) return false;

            // Check availability
            const evResp = eventResponses.find((e) => e.memberId === m.id && e.meetingId === meetingId);
            if (evResp) {
              return evResp.attending === true;
            }
            const com = commitments.find((c) => c.memberId === m.id && c.meetingId === meetingId);
            return com?.status === ServiceCommitmentStatus.COMMITTED;
          });
        }),
      },
      memberServiceCommitment: {
        findFirst: jest.fn(async ({ where }) => {
          return commitments.find((c) => c.memberId === where.memberId && c.meetingId === where.meetingId && (!where.status || c.status === where.status)) || null;
        }),
      },
      eventResponse: {
        findUnique: jest.fn(async ({ where }) => {
          const { memberId, meetingId } = where.memberId_meetingId;
          return eventResponses.find((e) => e.memberId === memberId && e.meetingId === meetingId) || null;
        }),
      },
      attendanceRecord: {
        findFirst: jest.fn(async ({ where }) => {
          return attendanceRecords.find((a) => a.memberId === where.memberId && a.meetingId === where.meetingId) || null;
        }),
        findMany: jest.fn(async ({ where }) => {
          return attendanceRecords.filter((a) => a.meetingId === where.meetingId);
        }),
      },
      memberNotification: {
        create: jest.fn(async ({ data }) => {
          const notif = { id: `notif-${notifications.length + 1}`, ...data, createdAt: new Date() };
          notifications.push(notif);
          return notif;
        }),
        findMany: jest.fn(async () => notifications),
      },
      communicationDelivery: {
        findUnique: jest.fn(async ({ where }) => {
          return deliveries.find((d) => d.idempotencyKey === where.idempotencyKey) || null;
        }),
        findMany: jest.fn(async ({ where }) => {
          if (where?.idempotencyKey?.startsWith) {
            const prefix = where.idempotencyKey.startsWith;
            return deliveries.filter((d) => d.idempotencyKey.startsWith(prefix));
          }
          return deliveries;
        }),
        create: jest.fn(async ({ data }) => {
          const existing = deliveries.find((d) => d.idempotencyKey === data.idempotencyKey);
          if (existing) {
            const err: any = new Error('Unique constraint violation');
            err.code = 'P2002';
            throw err;
          }
          const del = { id: `del-${deliveries.length + 1}`, ...data, createdAt: new Date() };
          deliveries.push(del);
          return del;
        }),
      },
      chatRoom: {
        findUnique: jest.fn(async ({ where }) => chatRooms.find((r) => r.key === where.key || r.id === where.id) || null),
      },
      pushSubscription: {
        findMany: jest.fn(async ({ where }) => {
          return pushSubscriptions.filter((s) => s.userId === where.userId && s.sessionExpiresAt > new Date());
        }),
      },
    };

    mockPrisma.$transaction = (fn: any) => fn(mockPrisma);
    mockPrisma.communicationDelivery.createMany = async ({ data }: any) => {
      let count = 0;
      for (const row of data) {
        if (!deliveries.some(d => d.idempotencyKey === row.idempotencyKey)) { deliveries.push({ ...row }); count++; }
      }
      return { count };
    };
    mockPrisma.communicationDelivery.update = async ({ where, data }: any) => {
      const row = deliveries.find(d => d.idempotencyKey === where.idempotencyKey);
      Object.assign(row, data); return row;
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceReminderService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMailService },
        { provide: PushService, useValue: mockPushService },
        { provide: ChatService, useValue: mockChatService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'APP_URL') return 'https://test.tfhc.org';
              return null;
            }),
          },
        },
      ],
    }).compile();

    serviceReminderService = module.get<ServiceReminderService>(ServiceReminderService);
  });

  // ---------------------------------------------------------------------------
  // 1. Triggering for Available Members vs Excluded Members
  // ---------------------------------------------------------------------------
  it('Scenario 1, 2, 3: sends reminders ONLY to Available members (John & Jane), NOT Peter (Not Available) or Mary (No Response)', async () => {
    const result = await serviceReminderService.dispatchActiveServiceReminders('meeting-sunday');

    expect(result.targetedMembersCount).toBe(3); // John, Jane, Mark (who hasn't attended yet)
    expect(result.emailSent).toBe(3);
    expect(result.chatCreated).toBe(0);
    expect(result.inAppCreated).toBe(3);

    // Verify John and Jane received notifications
    const johnNotif = notifications.find((n) => n.memberId === 'mem-john');
    const janeNotif = notifications.find((n) => n.memberId === 'mem-jane');
    const peterNotif = notifications.find((n) => n.memberId === 'mem-peter');
    const maryNotif = notifications.find((n) => n.memberId === 'mem-mary');

    expect(johnNotif).toBeDefined();
    expect(janeNotif).toBeDefined();
    expect(peterNotif).toBeUndefined(); // Excluded
    expect(maryNotif).toBeUndefined(); // Excluded

    // Verify email recipients
    expect(mockMailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'john@example.com', subject: expect.stringContaining('Sunday Service') }),
    );
    expect(mockMailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'jane@example.com', subject: expect.stringContaining('Sunday Service') }),
    );
    expect(mockMailService.sendEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: 'peter@example.com' }),
    );
    expect(mockMailService.sendEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: 'mary@example.com' }),
    );

    // Active attendance reminders do not repeatedly announce to General.
    expect(mockChatService.postSystemMessage).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 2. Member Already Attended
  // ---------------------------------------------------------------------------
  it('Scenario 4: does NOT send reminder if member already attended prior to activation workflow', async () => {
    // Mark attended
    attendanceRecords.push({
      id: 'att-mark',
      meetingId: 'meeting-sunday',
      memberId: 'mem-mark',
      status: 'ON_TIME',
    });

    const result = await serviceReminderService.dispatchActiveServiceReminders('meeting-sunday');

    // Mark should not be targeted
    const markNotif = notifications.find((n) => n.memberId === 'mem-mark');
    expect(markNotif).toBeUndefined();
    expect(result.targetedMembersCount).toBe(2); // Only John and Jane
  });

  // ---------------------------------------------------------------------------
  // 3. Duplicate Activation / Idempotency
  // ---------------------------------------------------------------------------
  it('Scenario 5: duplicate activation dispatches exactly once per channel and does not send duplicates', async () => {
    // First run
    await serviceReminderService.dispatchActiveServiceReminders('meeting-sunday');
    const initialDeliveriesCount = deliveries.length;
    const initialNotifCount = notifications.length;
    const initialMailCalls = mockMailService.sendEmail.mock.calls.length;

    // Second run
    await serviceReminderService.dispatchActiveServiceReminders('meeting-sunday');

    expect(deliveries.length).toBe(initialDeliveriesCount);
    expect(notifications.length).toBe(initialNotifCount);
    expect(mockMailService.sendEmail.mock.calls.length).toBe(initialMailCalls);
  });

  // ---------------------------------------------------------------------------
  // 4. Availability Changed Prior to Activation
  // ---------------------------------------------------------------------------
  it('Scenario 6: dynamically reacts to availability changes (eventResponses take precedence)', async () => {
    // Peter changes from Not Available to Available via EventResponse
    eventResponses.push({
      id: 'resp-peter',
      memberId: 'mem-peter',
      meetingId: 'meeting-sunday',
      attending: true,
    });

    // Jane changes from Available to Not Available via EventResponse
    eventResponses.push({
      id: 'resp-jane',
      memberId: 'mem-jane',
      meetingId: 'meeting-sunday',
      attending: false,
    });

    await serviceReminderService.dispatchActiveServiceReminders('meeting-sunday');

    const peterNotif = notifications.find((n) => n.memberId === 'mem-peter');
    const janeNotif = notifications.find((n) => n.memberId === 'mem-jane');

    expect(peterNotif).toBeDefined(); // Now eligible
    expect(janeNotif).toBeUndefined(); // Now excluded
  });

  // ---------------------------------------------------------------------------
  // 5. Cancelled Service
  // ---------------------------------------------------------------------------
  it('Scenario 7: does not send reminders if the service is cancelled or closed', async () => {
    const result = await serviceReminderService.dispatchActiveServiceReminders('meeting-cancelled');

    expect(result.targetedMembersCount).toBe(0);
    expect(result.pushSent).toBe(0);
    expect(result.emailSent).toBe(0);
    expect(notifications.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 6. Independent Channel Failure
  // ---------------------------------------------------------------------------
  it('Scenario 8 & 9: handles email failure independently without blocking push, in-app, or chat', async () => {
    // Modify John's email to cause SMTP failure
    const john = members.find((m) => m.id === 'mem-john');
    john.user.email = 'john-fail@example.com';
    john.approvedMember.normalizedEmail = 'john-fail@example.com';

    await serviceReminderService.dispatchActiveServiceReminders('meeting-sunday');

    // In-app and push delivery should still succeed
    const johnInApp = deliveries.find((d) => d.idempotencyKey === 'service-rem-meeting-sunday-mem-john-inapp');
    const johnPush = deliveries.find((d) => d.idempotencyKey === 'service-rem-meeting-sunday-mem-john-push');
    const johnEmail = deliveries.find((d) => d.idempotencyKey === 'service-rem-meeting-sunday-mem-john-email');

    expect(johnInApp?.status).toBe('SENT');
    expect(johnPush).toBeUndefined();
    expect(mockPushService.deliver).toHaveBeenCalled();
    expect(johnEmail?.status).toBe('FAILED');
    expect(johnEmail?.failureReason).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 7. Member Dashboard Pop-up API (getActiveReminderForMember)
  // ---------------------------------------------------------------------------
  it('Scenario 10: getActiveReminderForMember returns active reminder for available member who has not attended', async () => {
    const johnReminder = await serviceReminderService.getActiveReminderForMember('mem-john');
    expect(johnReminder.hasActiveReminder).toBe(true);
    expect(johnReminder.meeting?.id).toBe('meeting-sunday');
    expect(johnReminder.meeting?.title).toBe('Sunday Service');

    const peterReminder = await serviceReminderService.getActiveReminderForMember('mem-peter');
    expect(peterReminder.hasActiveReminder).toBe(false);
    expect(peterReminder.meeting).toBeNull();

    // After John checks in, reminder returns false
    attendanceRecords.push({
      id: 'att-john',
      meetingId: 'meeting-sunday',
      memberId: 'mem-john',
      status: 'ON_TIME',
    });

    const johnReminderAfterCheckIn = await serviceReminderService.getActiveReminderForMember('mem-john');
    expect(johnReminderAfterCheckIn.hasActiveReminder).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 8. Admin Visibility Stats Breakdown (getReminderStats)
  // ---------------------------------------------------------------------------
  it('Scenario 11: getReminderStats provides admin breakdown of deliveries and attendance', async () => {
    // Run initial dispatch
    await serviceReminderService.dispatchActiveServiceReminders('meeting-sunday');

    // One member attends
    attendanceRecords.push({
      id: 'att-john',
      meetingId: 'meeting-sunday',
      memberId: 'mem-john',
      status: 'ON_TIME',
    });

    const stats = await serviceReminderService.getReminderStats('meeting-sunday');

    expect(stats).toBeDefined();
    expect(stats?.totalAvailableMembers).toBe(3); // John, Jane, Mark
    expect(stats?.reminder.email.sent).toBe(3);
    expect(stats?.reminder.chat.created).toBe(0);
    expect(stats?.reminder.inApp.created).toBe(3);
    expect(stats?.attendance.taken).toBe(1); // John
    expect(stats?.attendance.notYetTaken).toBe(2); // Jane, Mark
  });
});
