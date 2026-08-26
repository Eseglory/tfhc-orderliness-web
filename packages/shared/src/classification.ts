import { AttendanceStatus } from './enums';

export interface MeetingTimeBoundaries {
  attendanceOpenTime: Date | string;
  expectedArrivalTime: Date | string;
  startTime: Date | string;
  gracePeriodMinutes: number;
  attendanceCloseTime: Date | string;
}

/**
 * Server-authoritative time-based attendance status classification.
 */
export function classifyAttendanceStatus(
  checkInTimeInput: Date | string,
  boundaries: MeetingTimeBoundaries
): AttendanceStatus {
  const checkInTime = new Date(checkInTimeInput).getTime();
  const openTime = new Date(boundaries.attendanceOpenTime).getTime();
  const expectedArrivalTime = new Date(boundaries.expectedArrivalTime).getTime();
  const startTime = new Date(boundaries.startTime).getTime();
  const closeTime = new Date(boundaries.attendanceCloseTime).getTime();

  const gracePeriodMs = boundaries.gracePeriodMinutes * 60 * 1000;
  const graceEnd = startTime + gracePeriodMs;

  if (checkInTime < openTime) {
    throw new Error('Attendance check-in has not opened yet.');
  }

  if (checkInTime > closeTime) {
    throw new Error('Attendance check-in has closed for this meeting.');
  }

  // Classification rules:
  if (checkInTime < expectedArrivalTime) {
    return AttendanceStatus.EARLY;
  }
  if (checkInTime <= startTime) {
    return AttendanceStatus.ON_TIME;
  }
  if (checkInTime <= graceEnd) {
    return AttendanceStatus.GRACE_PERIOD;
  }
  return AttendanceStatus.LATE;
}
