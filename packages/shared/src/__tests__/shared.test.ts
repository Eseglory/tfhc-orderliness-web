import { describe, it, expect } from 'vitest';
import {
  calculateHaversineDistanceMeters,
  validateGeofence,
  classifyAttendanceStatus,
  calculateAttendancePoints,
  calculateAttendancePercentage,
  calculatePunctualityPercentage,
  calculateCompositeLeaderboardScore,
  calculateAttendanceStreaks,
  AttendanceStatus,
} from '../index.js';

describe('Shared Domain Utilities', () => {
  describe('Haversine Geofence Engine', () => {
    it('calculates distance correctly between known coordinates', () => {
      // Lagos Cathedral to nearby point (~100m)
      const point1 = { latitude: 6.4531, longitude: 3.3958 };
      const point2 = { latitude: 6.4538, longitude: 3.3963 };
      const distance = calculateHaversineDistanceMeters(point1, point2);
      expect(distance).toBeGreaterThan(70);
      expect(distance).toBeLessThan(120);
    });

    it('validates geofence inside radius', () => {
      const venue = { latitude: 6.4531, longitude: 3.3958 };
      const device = { latitude: 6.4532, longitude: 3.3959 };
      const result = validateGeofence(device, venue, 100, 10);
      expect(result.isWithinGeofence).toBe(true);
      expect(result.distanceMeters).toBeLessThan(100);
    });

    it('rejects check-in outside radius', () => {
      const venue = { latitude: 6.4531, longitude: 3.3958 };
      const device = { latitude: 6.4600, longitude: 3.4000 };
      const result = validateGeofence(device, venue, 100, 15);
      expect(result.isWithinGeofence).toBe(false);
      expect(result.message).toContain('outside the attendance zone');
    });

    it('rejects check-in if GPS accuracy is poor (>100m)', () => {
      const venue = { latitude: 6.4531, longitude: 3.3958 };
      const device = { latitude: 6.4531, longitude: 3.3958 };
      const result = validateGeofence(device, venue, 100, 150);
      expect(result.isWithinGeofence).toBe(false);
      expect(result.message).toContain('GPS signal is too weak');
    });
  });

  describe('Attendance Classification Engine', () => {
    const boundaries = {
      attendanceOpenTime: '2026-08-30T08:15:00Z',
      expectedArrivalTime: '2026-08-30T08:45:00Z',
      startTime: '2026-08-30T09:00:00Z',
      gracePeriodMinutes: 10,
      attendanceCloseTime: '2026-08-30T10:00:00Z',
    };

    it('classifies EARLY check-in', () => {
      const status = classifyAttendanceStatus('2026-08-30T08:30:00Z', boundaries);
      expect(status).toBe(AttendanceStatus.EARLY);
    });

    it('classifies ON_TIME check-in', () => {
      const status = classifyAttendanceStatus('2026-08-30T08:50:00Z', boundaries);
      expect(status).toBe(AttendanceStatus.ON_TIME);
    });

    it('classifies GRACE_PERIOD check-in', () => {
      const status = classifyAttendanceStatus('2026-08-30T09:05:00Z', boundaries);
      expect(status).toBe(AttendanceStatus.GRACE_PERIOD);
    });

    it('classifies LATE check-in', () => {
      const status = classifyAttendanceStatus('2026-08-30T09:20:00Z', boundaries);
      expect(status).toBe(AttendanceStatus.LATE);
    });

    it('throws when check-in is before open time', () => {
      expect(() =>
        classifyAttendanceStatus('2026-08-30T08:00:00Z', boundaries)
      ).toThrow('Attendance check-in has not opened yet');
    });

    it('throws when check-in is after close time', () => {
      expect(() =>
        classifyAttendanceStatus('2026-08-30T10:05:00Z', boundaries)
      ).toThrow('Attendance check-in has closed');
    });
  });

  describe('Scoring & Metrics Engine', () => {
    it('calculates points with meeting weights correctly', () => {
      const pointsStandard = calculateAttendancePoints(AttendanceStatus.ON_TIME, 1.0);
      expect(pointsStandard).toBe(10);

      const pointsWeighted = calculateAttendancePoints(AttendanceStatus.ON_TIME, 1.5);
      expect(pointsWeighted).toBe(15);
    });

    it('calculates attendance percentage', () => {
      expect(calculateAttendancePercentage(18, 20)).toBe(90);
      expect(calculateAttendancePercentage(0, 10)).toBe(0);
    });

    it('calculates punctuality percentage', () => {
      expect(calculatePunctualityPercentage(15, 18)).toBe(83.3);
    });

    it('calculates composite leaderboard score (60% attendance + 40% punctuality)', () => {
      expect(calculateCompositeLeaderboardScore(90, 80)).toBe(86);
    });

    it('calculates consecutive streaks handling excuses properly', () => {
      const records = [
        { meetingDate: '2026-08-23', status: AttendanceStatus.ON_TIME },
        { meetingDate: '2026-08-16', status: AttendanceStatus.EXCUSED }, // Freeze
        { meetingDate: '2026-08-09', status: AttendanceStatus.EARLY },
        { meetingDate: '2026-08-02', status: AttendanceStatus.LATE }, // Breaks on-time streak
        { meetingDate: '2026-07-26', status: AttendanceStatus.ON_TIME },
      ];

      const streaks = calculateAttendanceStreaks(records);
      expect(streaks.currentAttendanceStreak).toBe(4);
      expect(streaks.currentOnTimeStreak).toBe(2);
    });
  });
});
