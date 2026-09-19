import { Test, TestingModule } from '@nestjs/testing';
import { MeetingsService } from '../src/modules/meetings/meetings.service';
import { LookupsService } from '../src/modules/lookups/lookups.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { CacheService } from '../src/common/cache/cache.service';
import { AuditService } from '../src/common/rbac/audit.service';
import { AbsenceProcessingJob } from '../src/jobs/absence-processing.job';
import { MailService } from '../src/modules/mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('Supervising Minister & Disciplinary Committee Suite', () => {
  let meetingsService: MeetingsService;
  let lookupsService: LookupsService;

  const meetingId = 'test-meeting-001';
  const nicoleId = 'member-nicole-001';
  const adedotunId = 'member-adedotun-002';
  const jacobId = 'member-jacob-003';
  const regularMemberId = 'member-regular-004';
  const executiveLeaderId = 'member-exec-005';

  const mockDisciplinarySubTeam = { id: 'subteam-dc', name: 'Disciplinary Committee' };
  const mockExecutiveSubTeam = { id: 'subteam-exec', name: 'Executive' };
  const mockChoirSubTeam = { id: 'subteam-choir', name: 'Choir' };

  const membersStore = new Map<string, any>([
    [
      nicoleId,
      {
        id: nicoleId,
        firstName: 'Nicole',
        lastName: 'Okafor',
        email: 'nicoleokafor0@gmail.com',
        status: 'ACTIVE',
        subTeamId: mockDisciplinarySubTeam.id,
        subTeam: mockDisciplinarySubTeam,
        roleInUnit: 'Member',
      },
    ],
    [
      adedotunId,
      {
        id: adedotunId,
        firstName: 'Adedotun',
        lastName: 'Akingbesote',
        email: 'dotunakingbesote@gmail.com',
        status: 'ACTIVE',
        subTeamId: mockDisciplinarySubTeam.id,
        subTeam: mockDisciplinarySubTeam,
        roleInUnit: 'Member',
      },
    ],
    [
      jacobId,
      {
        id: jacobId,
        firstName: 'Jacob',
        lastName: 'Onoja',
        email: 'onojamonday123@gmail.com',
        status: 'ACTIVE',
        subTeamId: mockDisciplinarySubTeam.id,
        subTeam: mockDisciplinarySubTeam,
        roleInUnit: 'Member',
      },
    ],
    [
      executiveLeaderId,
      {
        id: executiveLeaderId,
        firstName: 'Emmanuel',
        lastName: 'Executive',
        email: 'exec@tfhc.org',
        status: 'ACTIVE',
        subTeamId: mockExecutiveSubTeam.id,
        subTeam: mockExecutiveSubTeam,
        roleInUnit: 'Executive',
      },
    ],
    [
      regularMemberId,
      {
        id: regularMemberId,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@tfhc.org',
        status: 'ACTIVE',
        subTeamId: mockChoirSubTeam.id,
        subTeam: mockChoirSubTeam,
        roleInUnit: 'Member',
      },
    ],
  ]);

  const meetingsStore = new Map<string, any>([
    [
      meetingId,
      {
        id: meetingId,
        title: 'Sunday Celebration Service',
        status: 'ACTIVE',
        startTime: new Date(),
        meetingDate: new Date(),
        attendanceOpenTime: new Date(),
        expectedArrivalTime: new Date(),
        attendanceCloseTime: new Date(Date.now() + 3600000),
        categoryId: 'cat-1',
        locationName: 'Main Sanctuary',
        latitude: 6.669,
        longitude: 3.358,
        gracePeriodMinutes: 10,
        supervisingMinisterId: null,
      },
    ],
  ]);

  const subTeamsStore = new Map<string, any>([
    [mockDisciplinarySubTeam.id, { ...mockDisciplinarySubTeam, members: [] }],
    [mockExecutiveSubTeam.id, { ...mockExecutiveSubTeam, members: [] }],
    [mockChoirSubTeam.id, { ...mockChoirSubTeam, members: [] }],
  ]);

  const mockPrisma: any = {
    member: {
      findMany: jest.fn().mockImplementation(({ where }) => {
        const results = Array.from(membersStore.values()).filter((m) => {
          if (where?.status && m.status !== where.status) return false;
          if (where?.OR) {
            const matchesSubTeam = where.OR.some(
              (clause: any) =>
                clause.subTeam?.name?.in &&
                clause.subTeam.name.in.includes(m.subTeam?.name),
            );
            const matchesRole = where.OR.some(
              (clause: any) =>
                clause.roleInUnit?.in &&
                clause.roleInUnit.in.includes(m.roleInUnit),
            );
            return matchesSubTeam || matchesRole;
          }
          if (where?.email?.in) {
            return where.email.in.includes(m.email);
          }
          return true;
        });
        return Promise.resolve(results);
      }),
      findFirst: jest.fn().mockImplementation(({ where }) => {
        for (const m of membersStore.values()) {
          if (where.id && m.id !== where.id) continue;
          if (where.status && m.status !== where.status) continue;
          if (where.OR) {
            const matchesSubTeam = where.OR.some(
              (clause: any) =>
                clause.subTeam?.name?.in &&
                clause.subTeam.name.in.includes(m.subTeam?.name),
            );
            const matchesRole = where.OR.some(
              (clause: any) =>
                clause.roleInUnit?.in &&
                clause.roleInUnit.in.includes(m.roleInUnit),
            );
            if (!matchesSubTeam && !matchesRole) continue;
          }
          return Promise.resolve(m);
        }
        return Promise.resolve(null);
      }),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(membersStore.get(where.id) || null);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const member = membersStore.get(where.id);
        if (member) {
          Object.assign(member, data);
        }
        return Promise.resolve(member);
      }),
      updateMany: jest.fn().mockImplementation(({ where, data }) => {
        let count = 0;
        for (const m of membersStore.values()) {
          if (where.id?.in && where.id.in.includes(m.id)) {
            Object.assign(m, data);
            count++;
          }
        }
        return Promise.resolve({ count });
      }),
      count: jest.fn().mockImplementation(({ where }) => {
        if (where?.id?.in) {
          const matched = where.id.in.filter((id: string) => membersStore.has(id));
          return Promise.resolve(matched.length);
        }
        return Promise.resolve(membersStore.size);
      }),
    },
    subTeam: {
      findFirst: jest.fn().mockImplementation(({ where }) => {
        for (const st of subTeamsStore.values()) {
          if (where.name?.equals && st.name.toLowerCase() === where.name.equals.toLowerCase()) {
            return Promise.resolve(st);
          }
          if (where.name && st.name === where.name) {
            return Promise.resolve(st);
          }
        }
        return Promise.resolve(null);
      }),
      findMany: jest.fn().mockImplementation(() => {
        return Promise.resolve(Array.from(subTeamsStore.values()));
      }),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        for (const st of subTeamsStore.values()) {
          if (where.name && st.name === where.name) return Promise.resolve(st);
          if (where.id && st.id === where.id) return Promise.resolve(st);
        }
        return Promise.resolve(null);
      }),
      upsert: jest.fn().mockImplementation(({ where, update, create }) => {
        for (const st of subTeamsStore.values()) {
          if (where.name && st.name === where.name) {
            Object.assign(st, update);
            return Promise.resolve(st);
          }
        }
        const id = `subteam-${Date.now()}`;
        const record = { id, ...create };
        subTeamsStore.set(id, record);
        return Promise.resolve(record);
      }),
      create: jest.fn().mockImplementation(({ data }) => {
        const id = `subteam-${Date.now()}`;
        const record = { id, ...data };
        subTeamsStore.set(id, record);
        return Promise.resolve(record);
      }),
      count: jest.fn().mockImplementation(({ where }) => {
        if (where?.id?.in) {
          const matched = where.id.in.filter((id: string) => subTeamsStore.has(id));
          return Promise.resolve(matched.length);
        }
        return Promise.resolve(subTeamsStore.size);
      }),
    },
    meeting: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        const m = meetingsStore.get(where.id);
        if (!m) return Promise.resolve(null);
        return Promise.resolve({
          ...m,
          supervisingMinister: m.supervisingMinisterId
            ? membersStore.get(m.supervisingMinisterId)
            : null,
        });
      }),
      findMany: jest.fn().mockImplementation(() => {
        return Promise.resolve(
          Array.from(meetingsStore.values()).map((m) => ({
            ...m,
            supervisingMinister: m.supervisingMinisterId
              ? membersStore.get(m.supervisingMinisterId)
              : null,
          })),
        );
      }),
      create: jest.fn().mockImplementation(({ data }) => {
        const id = `meeting-${Date.now()}`;
        const record = { id, ...data };
        meetingsStore.set(id, record);
        return Promise.resolve(record);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const meeting = meetingsStore.get(where.id);
        if (meeting) {
          if (data.supervisingMinister?.connect) {
            meeting.supervisingMinisterId = data.supervisingMinister.connect.id;
          } else if (data.supervisingMinister?.disconnect) {
            meeting.supervisingMinisterId = null;
          }
          Object.assign(meeting, data);
        }
        return Promise.resolve({
          ...meeting,
          supervisingMinister: meeting.supervisingMinisterId
            ? membersStore.get(meeting.supervisingMinisterId)
            : null,
        });
      }),
    },
    meetingCategory: {
      findUnique: jest.fn().mockResolvedValue({ id: 'cat-1', name: 'Sunday Service' }),
    },
    $transaction: jest.fn().mockImplementation((cb) => cb(mockPrisma)),
  };

  const mockCache: any = {
    getOrSet: jest.fn().mockImplementation((key, fetcher) => fetcher()),
    invalidateTags: jest.fn().mockResolvedValue(undefined),
  };

  const mockAudit: any = {
    record: jest.fn().mockResolvedValue(undefined),
    recordWithin: jest.fn().mockResolvedValue(undefined),
  };

  const mockAbsenceJob: any = {
    triggerReconciliation: jest.fn().mockResolvedValue(undefined),
  };

  const mockMail: any = {
    sendMail: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfig: any = {
    get: jest.fn().mockReturnValue('http://localhost:3000'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeetingsService,
        LookupsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: mockCache },
        { provide: AuditService, useValue: mockAudit },
        { provide: AbsenceProcessingJob, useValue: mockAbsenceJob },
        { provide: MailService, useValue: mockMail },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    meetingsService = module.get<MeetingsService>(MeetingsService);
    lookupsService = module.get<LookupsService>(LookupsService);
  });

  describe('Candidate Pool Filtering', () => {
    it('should only return candidates belonging to Executive or Disciplinary Committee', async () => {
      const candidates = await meetingsService.getSupervisingMinisterCandidates();
      const candidateIds = candidates.map((c) => c.id);

      expect(candidateIds).toContain(nicoleId);
      expect(candidateIds).toContain(adedotunId);
      expect(candidateIds).toContain(jacobId);
      expect(candidateIds).toContain(executiveLeaderId);
      expect(candidateIds).not.toContain(regularMemberId);
    });
  });

  describe('Supervising Minister Appointment Workflow', () => {
    it('should appoint an eligible member manually', async () => {
      const updated = await meetingsService.appointSupervisingMinister(
        meetingId,
        { memberId: nicoleId },
        'admin-user',
      );

      expect(updated.supervisingMinisterId).toBe(nicoleId);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MEETING_SUPERVISING_MINISTER_APPOINTED',
          entity: 'Meeting',
          entityId: meetingId,
        }),
      );
    });

    it('should randomly select a minister from the eligible candidate pool', async () => {
      const updated = await meetingsService.appointSupervisingMinister(
        meetingId,
        { random: true },
        'admin-user',
      );

      const eligibleIds = [nicoleId, adedotunId, jacobId, executiveLeaderId];
      expect(eligibleIds).toContain(updated.supervisingMinisterId);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MEETING_SUPERVISING_MINISTER_APPOINTED',
          entity: 'Meeting',
        }),
      );
    });

    it('should reject non-eligible members with BadRequestException', async () => {
      await expect(
        meetingsService.appointSupervisingMinister(
          meetingId,
          { memberId: regularMemberId },
          'admin-user',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow clearing the supervising minister', async () => {
      const updated = await meetingsService.appointSupervisingMinister(
        meetingId,
        { memberId: null },
        'admin-user',
      );

      expect(updated.supervisingMinisterId).toBeNull();
    });
  });

  describe('Meeting Creation & Update with Supervising Minister', () => {
    it('should support autoAssignSupervisingMinister on meeting creation', async () => {
      const now = new Date();
      const created = await meetingsService.createMeeting({
        title: 'Midweek Service',
        categoryId: 'cat-1',
        meetingDate: now.toISOString(),
        startTime: now.toISOString(),
        expectedArrivalTime: now.toISOString(),
        attendanceOpenTime: now.toISOString(),
        attendanceCloseTime: new Date(now.getTime() + 3600000).toISOString(),
        locationName: 'Main Sanctuary',
        latitude: 6.669,
        longitude: 3.358,
        gracePeriodMinutes: 10,
        autoAssignSupervisingMinister: true,
      });

      const eligibleIds = [nicoleId, adedotunId, jacobId, executiveLeaderId];
      expect(eligibleIds).toContain(created.supervisingMinisterId);
    });
  });

  describe('System SubTeams Sync', () => {
    it('should ensure Executive and Disciplinary Committee subteams exist', async () => {
      await lookupsService.syncSystemSubTeams();

      expect(mockPrisma.subTeam.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { name: 'Disciplinary Committee' },
        }),
      );
      expect(mockPrisma.subTeam.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { name: 'Executive' },
        }),
      );
      expect(mockPrisma.member.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subTeamId: mockDisciplinarySubTeam.id,
          }),
        }),
      );
    });
  });
});
