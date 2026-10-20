import { serviceAttendanceOpenTime } from '../src/common/service-attendance-window';

describe('Service attendance opening policy', () => {
  it('gives online services an exact start instead of the physical early opening', () => {
    expect(serviceAttendanceOpenTime('2026-10-21T19:00:00Z', '2026-10-21T18:35:00Z', 'SERVICE', 'Sunday Service', true).toISOString())
      .toBe('2026-10-21T19:00:00.000Z');
  });
  it.each(['SERVICE', 'SPECIAL_SERVICE'])('opens %s exactly 25 minutes before start', key => {
    expect(serviceAttendanceOpenTime('2026-10-20T17:45:00Z', '2026-10-20T17:30:00Z', key).toISOString())
      .toBe('2026-10-20T17:20:00.000Z');
  });
  it.each(['Sunday Service', 'Midweek Service', 'Special Programme'])('covers category-only %s events', name => {
    expect(serviceAttendanceOpenTime('2026-10-25T06:00:00Z', '2026-10-25T05:00:00Z', null, name).toISOString())
      .toBe('2026-10-25T05:35:00.000Z');
  });
  it('preserves the independent online unit meeting window', () => {
    expect(serviceAttendanceOpenTime('2026-10-21T19:00:00Z', '2026-10-21T19:00:00Z', 'MEETING', 'Unit Meeting').toISOString())
      .toBe('2026-10-21T19:00:00.000Z');
  });
  it('uses the new start time when a service is rescheduled', () => {
    expect(serviceAttendanceOpenTime('2026-10-25T07:30:00Z', '2026-10-25T05:35:00Z', 'SERVICE').toISOString())
      .toBe('2026-10-25T07:05:00.000Z');
  });
});
