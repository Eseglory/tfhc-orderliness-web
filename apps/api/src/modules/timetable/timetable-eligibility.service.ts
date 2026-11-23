import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Member, User, MemberStatus } from '@prisma/client';

export interface MemberEligibilityResult {
  memberId: string;
  memberCode: string;
  name: string;
  phoneNumber: string;
  email: string | null;
  roleInUnit: string;
  subTeamName: string | null;
  isEligible: boolean;
  criteria: {
    existsInSystem: boolean;
    hasCompletedProfile: boolean;
    hasRegisteredCredentials: boolean;
    hasSignedInAtLeastOnce: boolean;
    hasAttemptedClockIn: boolean;
    isActiveAndNotSuspended: boolean;
  };
  exclusionReasons: string[];
  lastLoginAt: Date | null;
  totalAttendanceRecords: number;
  totalClockInAttempts: number;
}

export interface EligibilitySummaryStats {
  totalLookupMembers: number;
  totalRegisteredMembers: number;
  totalEligibleActiveMembers: number;
  totalExcludedMembers: number;
  reasonsBreakdown: Array<{ reason: string; count: number }>;
}

@Injectable()
export class TimetableEligibilityService {
  private readonly logger = new Logger(TimetableEligibilityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluates all candidates and returns only those who satisfy ALL 5 active engagement criteria:
   * 1. Member record exists in the system.
   * 2. Member has successfully created/completed their profile.
   * 3. Member has registered their login credentials.
   * 4. Member has successfully signed in at least once (lastLoginAt is not null).
   * 5. Member has made at least one attempt to clock in (via AttendanceRecord or ClockInAttempt).
   */
  async getEligibleActiveMembers(): Promise<MemberEligibilityResult[]> {
    const allMembers = await this.prisma.member.findMany({
      include: {
        user: true,
        subTeam: true,
        attendanceRecords: {
          select: { id: true, actualArrivalTime: true, status: true, joinedAt: true },
        },
        clockInAttempts: {
          select: { id: true, attemptedAt: true, success: true },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const evaluated = allMembers.map((m) => this.evaluateMember(m));
    return evaluated.filter((m) => m.isEligible);
  }

  /**
   * Full administrative audit of all members and lookup table entries with eligibility status and reasons.
   */
  async getEligibilityAudit(): Promise<{
    stats: EligibilitySummaryStats;
    eligibleMembers: MemberEligibilityResult[];
    excludedMembers: MemberEligibilityResult[];
  }> {
    const [totalLookupMembers, allMembers] = await Promise.all([
      this.prisma.approvedMember.count(),
      this.prisma.member.findMany({
        include: {
          user: true,
          subTeam: true,
          attendanceRecords: {
            select: { id: true, actualArrivalTime: true, status: true, joinedAt: true },
          },
          clockInAttempts: {
            select: { id: true, attemptedAt: true, success: true },
          },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
    ]);

    const evaluated = allMembers.map((m) => this.evaluateMember(m));

    const eligibleMembers = evaluated.filter((m) => m.isEligible);
    const excludedMembers = evaluated.filter((m) => !m.isEligible);

    // Group exclusion reasons
    const reasonCounts = new Map<string, number>();
    for (const ex of excludedMembers) {
      for (const reason of ex.exclusionReasons) {
        reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
      }
    }

    const unlinkedLookupCount = await this.prisma.approvedMember.count({
      where: { memberId: null },
    });
    if (unlinkedLookupCount > 0) {
      reasonCounts.set('Lookup table entry only (registration never started)', unlinkedLookupCount);
    }

    const reasonsBreakdown = Array.from(reasonCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    const registeredCount = allMembers.filter((m) => m.userId != null).length;

    const stats: EligibilitySummaryStats = {
      totalLookupMembers,
      totalRegisteredMembers: registeredCount,
      totalEligibleActiveMembers: eligibleMembers.length,
      totalExcludedMembers: excludedMembers.length + unlinkedLookupCount,
      reasonsBreakdown,
    };

    return {
      stats,
      eligibleMembers,
      excludedMembers,
    };
  }

  /**
   * Helper that checks individual member against the 5 criteria without false classification.
   */
  evaluateMember(m: any): MemberEligibilityResult {
    const reasons: string[] = [];

    // Condition 1: Record exists in system
    const existsInSystem = Boolean(m && m.id);
    if (!existsInSystem) reasons.push('Member record does not exist in the system');

    // Condition 2: Profile created and complete
    const hasCompletedProfile = Boolean(
      m.userId &&
      m.firstName && m.firstName.trim().length > 0 &&
      m.lastName && m.lastName.trim().length > 0 &&
      m.phoneNumber && m.phoneNumber.trim().length > 0,
    );
    if (!m.userId) {
      reasons.push('Member profile is not connected to a user account');
    } else if (!hasCompletedProfile) {
      reasons.push('Member profile details are incomplete (missing name or phone number)');
    }

    // Status check
    const isActiveAndNotSuspended = m.status === MemberStatus.ACTIVE && (!m.user || (m.user.isActive && !m.user.deactivatedAt));
    if (!isActiveAndNotSuspended) {
      reasons.push(`Member is not in active standing (status: ${m.status}${m.user?.deactivatedAt ? ', user deactivated' : ''})`);
    }

    // Condition 3: Registered login credentials
    const hasRegisteredCredentials = Boolean(
      m.user &&
      m.user.passwordHash &&
      m.user.passwordHash.trim().length > 0,
    );
    if (!hasRegisteredCredentials) {
      reasons.push('Login credentials (account/password) have not been registered');
    }

    // Condition 4: Signed into mobile application at least once since launch
    const hasSignedInAtLeastOnce = Boolean(m.user && m.user.lastLoginAt != null);
    if (!hasSignedInAtLeastOnce) {
      reasons.push('Has never signed into the application since launch');
    }

    // Condition 5: Attempted to clock in at least once
    const hasAttendanceClockIn = Array.isArray(m.attendanceRecords) && m.attendanceRecords.some((r: any) =>
      r.actualArrivalTime != null || r.joinedAt != null || (r.status && r.status !== 'ABSENT')
    );
    const hasClockInAttempt = Array.isArray(m.clockInAttempts) && m.clockInAttempts.length > 0;
    const hasAttemptedClockIn = hasAttendanceClockIn || hasClockInAttempt;
    if (!hasAttemptedClockIn) {
      reasons.push('Has never made any attempt to clock in through the application');
    }

    const isEligible =
      existsInSystem &&
      hasCompletedProfile &&
      isActiveAndNotSuspended &&
      hasRegisteredCredentials &&
      hasSignedInAtLeastOnce &&
      hasAttemptedClockIn;

    return {
      memberId: m.id,
      memberCode: m.memberCode,
      name: `${m.firstName} ${m.lastName}`.trim(),
      phoneNumber: m.phoneNumber,
      email: m.user?.email ?? null,
      roleInUnit: m.roleInUnit || 'Member',
      subTeamName: m.subTeam?.name ?? null,
      isEligible,
      criteria: {
        existsInSystem,
        hasCompletedProfile,
        hasRegisteredCredentials,
        hasSignedInAtLeastOnce,
        hasAttemptedClockIn,
        isActiveAndNotSuspended,
      },
      exclusionReasons: reasons,
      lastLoginAt: m.user?.lastLoginAt ?? null,
      totalAttendanceRecords: m.attendanceRecords?.length ?? 0,
      totalClockInAttempts: (m.attendanceRecords?.length ?? 0) + (m.clockInAttempts?.length ?? 0),
    };
  }
}
