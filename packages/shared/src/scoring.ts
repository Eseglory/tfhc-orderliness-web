import { AttendanceStatus } from './enums';

export interface ScoringRubric {
  earlyPoints: number;      // Default 10
  onTimePoints: number;     // Default 10
  gracePeriodPoints: number;// Default 8
  latePoints: number;       // Default 5
  absentPoints: number;     // Default 0
  excusedPoints: number;    // Default 0
}

export const DEFAULT_SCORING_RUBRIC: ScoringRubric = {
  earlyPoints: 10,
  onTimePoints: 10,
  gracePeriodPoints: 8,
  latePoints: 5,
  absentPoints: 0,
  excusedPoints: 0,
};

/**
 * Calculates points earned for an attendance record based on status and meeting weight.
 */
export function calculateAttendancePoints(
  status: AttendanceStatus,
  meetingWeight: number = 1.0,
  rubric: ScoringRubric = DEFAULT_SCORING_RUBRIC
): number {
  let basePoints = 0;

  switch (status) {
    case AttendanceStatus.EARLY:
      basePoints = rubric.earlyPoints;
      break;
    case AttendanceStatus.ON_TIME:
      basePoints = rubric.onTimePoints;
      break;
    case AttendanceStatus.GRACE_PERIOD:
      basePoints = rubric.gracePeriodPoints;
      break;
    case AttendanceStatus.LATE:
      basePoints = rubric.latePoints;
      break;
    case AttendanceStatus.EXCUSED:
      basePoints = rubric.excusedPoints;
      break;
    case AttendanceStatus.ABSENT:
    case AttendanceStatus.EXEMPT:
    default:
      basePoints = rubric.absentPoints;
      break;
  }

  return Math.round(basePoints * meetingWeight * 100) / 100;
}

/**
 * Attendance Rate Percentage calculation.
 * Formula: (Attended Meetings / Expected Meetings) * 100
 */
export function calculateAttendancePercentage(
  attendedCount: number,
  expectedCount: number
): number {
  if (expectedCount <= 0) return 0;
  const rate = (attendedCount / expectedCount) * 100;
  return Math.min(100, Math.round(rate * 10) / 10);
}

/**
 * Punctuality Rate Percentage calculation.
 * Formula: (On-Time + Early Meetings / Total Attended Meetings) * 100
 */
export function calculatePunctualityPercentage(
  onTimeAndEarlyCount: number,
  totalAttendedCount: number
): number {
  if (totalAttendedCount <= 0) return 0;
  const rate = (onTimeAndEarlyCount / totalAttendedCount) * 100;
  return Math.min(100, Math.round(rate * 10) / 10);
}

/**
 * Composite Leaderboard Overall Score calculation.
 * Formula: (Attendance Rate * attendanceWeight) + (Punctuality Rate * punctualityWeight)
 * Defaults: 60% Attendance + 40% Punctuality
 */
export function calculateCompositeLeaderboardScore(
  attendancePercentage: number,
  punctualityPercentage: number,
  attendanceWeight: number = 0.60,
  punctualityWeight: number = 0.40
): number {
  const score =
    attendancePercentage * attendanceWeight +
    punctualityPercentage * punctualityWeight;
  return Math.round(score * 10) / 10;
}

export interface AttendanceRecordForStreak {
  meetingDate: Date | string;
  status: AttendanceStatus;
}

/**
 * Calculates current attendance streak & on-time streak.
 */
export function calculateAttendanceStreaks(recordsSortedByDateDesc: AttendanceRecordForStreak[]): {
  currentAttendanceStreak: number;
  currentOnTimeStreak: number;
} {
  let currentAttendanceStreak = 0;
  let currentOnTimeStreak = 0;
  let attendanceBroken = false;
  let onTimeBroken = false;

  for (const record of recordsSortedByDateDesc) {
    if (record.status === AttendanceStatus.EXEMPT) {
      continue; // Exempt meetings do not reset or increment streaks
    }

    if (record.status === AttendanceStatus.EXCUSED) {
      continue; // Excused absences freeze the streak without resetting
    }

    const isAttended =
      record.status === AttendanceStatus.EARLY ||
      record.status === AttendanceStatus.ON_TIME ||
      record.status === AttendanceStatus.GRACE_PERIOD ||
      record.status === AttendanceStatus.LATE;

    const isOnTime =
      record.status === AttendanceStatus.EARLY ||
      record.status === AttendanceStatus.ON_TIME;

    if (isAttended && !attendanceBroken) {
      currentAttendanceStreak++;
    } else {
      attendanceBroken = true;
    }

    if (isOnTime && !onTimeBroken) {
      currentOnTimeStreak++;
    } else {
      onTimeBroken = true;
    }

    if (attendanceBroken && onTimeBroken) {
      break;
    }
  }

  return {
    currentAttendanceStreak,
    currentOnTimeStreak,
  };
}
