import { AttendanceService } from '../src/modules/attendance/attendance.service';

describe('Sunday automatic attendance', () => {
  const memberId = 'member';
  const first = { id: 'first', title: 'First Service', startTime: new Date('2026-10-11T06:00:00Z'),
    attendanceOpenTime: new Date('2026-10-11T05:00:00Z'), attendanceCloseTime: new Date('2026-10-11T07:00:00Z'),
    status: 'COMPLETED', locationName: 'Church', address: '', visibility: 'PUBLIC', audiences: [] };
  const second = { ...first, id: 'second', title: 'Second Service', startTime: new Date('2026-10-11T07:30:00Z'),
    attendanceOpenTime: new Date('2026-10-11T07:00:00Z'), attendanceCloseTime: new Date('2026-10-11T09:00:00Z'), status: 'ACTIVE' };
  let prisma: any;
  let service: AttendanceService;
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-11T07:15:00Z'));
    prisma = { meeting: { findMany: jest.fn().mockResolvedValue([first, second]) },
      attendanceRecord: { findMany: jest.fn().mockResolvedValue([{ meetingId: 'first', attendanceType: 'PHYSICAL',
        method: 'SYSTEM_GEO', actualArrivalTime: new Date('2026-10-11T05:50:00Z') }]) },
      member: { findUnique: jest.fn().mockResolvedValue({ id: memberId, status: 'ACTIVE' }) } };
    service = new AttendanceService(prisma, {} as any, {} as any);
  });
  afterEach(() => jest.useRealTimers());
  it('enables only a later open Sunday service after verified attendance', async () => {
    expect(await service.getSundayAutoCheckIn(memberId)).toEqual({ enabled: true, meetings: [{ id: 'second', title: 'Second Service' }] });
    expect(prisma.meeting.findMany.mock.calls[0][0].where).toMatchObject({ category: { name: 'Sunday Service' }, isOnline: false });
  });
  it('uses the Nigeria day boundary and disables at Monday midnight', async () => {
    jest.setSystemTime(new Date('2026-10-11T23:00:00Z'));
    expect(await service.getSundayAutoCheckIn(memberId)).toEqual({ enabled: false, meetings: [] });
    expect(prisma.meeting.findMany).not.toHaveBeenCalled();
  });
  it('queries only the current Nigeria Sunday', async () => {
    await service.getSundayAutoCheckIn(memberId);
    expect(prisma.meeting.findMany.mock.calls[0][0].where.startTime).toEqual({
      gte: new Date('2026-10-10T23:00:00Z'), lt: new Date('2026-10-11T23:00:00Z'),
    });
  });
  it('does not enable without an initial physical GPS check-in', async () => {
    prisma.attendanceRecord.findMany.mockResolvedValue([]);
    expect((await service.getSundayAutoCheckIn(memberId)).enabled).toBe(false);
  });
  it('excludes recorded, closed and virtual services', async () => {
    prisma.meeting.findMany.mockResolvedValue([first, { ...second, status: 'COMPLETED' }, { ...second, id: 'virtual', locationName: 'Online' }]);
    expect((await service.getSundayAutoCheckIn(memberId)).meetings).toEqual([]);
  });
  it('does not duplicate existing attendance', async () => {
    const records = await prisma.attendanceRecord.findMany();
    prisma.attendanceRecord.findMany.mockResolvedValue([...records, { meetingId: 'second' }]);
    expect((await service.getSundayAutoCheckIn(memberId)).meetings).toEqual([]);
  });
  const location = () => ({ memberId, meetingId: 'second', latitude: 6.6697906, longitude: 3.3581822,
    gpsAccuracy: 10, locationTimestamp: Date.now() });
  it.each([61000, -6000])('rejects stale or future position (%s ms)', async age => {
    await expect(service.sundayAutoCheckIn({ ...location(), locationTimestamp: Date.now() - age })).rejects.toThrow('fresh');
  });
  it.each([NaN, 101, -1])('rejects inaccurate GPS (%s)', async gpsAccuracy => {
    await expect(service.sundayAutoCheckIn({ ...location(), gpsAccuracy })).rejects.toThrow('fresh');
  });
  it('rejects attempts to check in to an ineligible service', async () => {
    await expect(service.sundayAutoCheckIn({ ...location(), meetingId: 'first' })).rejects.toThrow('not eligible');
  });
  it('uses the existing server geofence and attendance checks', async () => {
    const check = jest.spyOn(service, 'checkInMember').mockRejectedValue(new Error('outside attendance zone'));
    await expect(service.sundayAutoCheckIn(location())).rejects.toThrow('outside attendance zone');
    expect(check).toHaveBeenCalledWith(location());
  });
});
