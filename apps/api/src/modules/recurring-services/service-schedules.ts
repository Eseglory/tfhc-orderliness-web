export const SERVICE_SCHEDULES = [
  { id: 'sunday-first', title: 'First Service', dayOfWeek: 0, startMinutes: 420, endMinutes: 480, categoryName: 'Sunday Service' },
  { id: 'sunday-second', title: 'Second Service', dayOfWeek: 0, startMinutes: 510, endMinutes: 600, categoryName: 'Sunday Service' },
  { id: 'sunday-third', title: 'Third Service', dayOfWeek: 0, startMinutes: 630, endMinutes: 720, categoryName: 'Sunday Service' },
  { id: 'sunday-youth', title: 'Youth Church', dayOfWeek: 0, startMinutes: 495, endMinutes: 600, categoryName: 'Sunday Service' },
  { id: 'sunday-teens', title: 'Teens Church', dayOfWeek: 0, startMinutes: 630, endMinutes: 720, categoryName: 'Sunday Service' },
  { id: 'sunday-children-0730', title: 'Children’s Church (7:30 AM)', dayOfWeek: 0, startMinutes: 450, endMinutes: null, categoryName: 'Sunday Service' },
  { id: 'sunday-children-0830', title: 'Children’s Church (8:30 AM)', dayOfWeek: 0, startMinutes: 510, endMinutes: null, categoryName: 'Sunday Service' },
  { id: 'sunday-children-1030', title: 'Children’s Church (10:30 AM)', dayOfWeek: 0, startMinutes: 630, endMinutes: null, categoryName: 'Sunday Service' },
  { id: 'tuesday-midweek', title: 'Mid-Week Service', dayOfWeek: 2, startMinutes: 1125, endMinutes: 1215, categoryName: 'Midweek Service' },
  { id: 'thursday-divine', title: 'Divine Intervention Service', dayOfWeek: 4, startMinutes: 480, endMinutes: 600, categoryName: 'Special Programme' },
];

// Africa/Lagos is UTC+01:00 year-round. Date arithmetic stays independent of host timezone.
export function occurrences(schedule: { dayOfWeek: number; startMinutes: number; endMinutes: number | null }, now: Date, days = 28) {
  const local = new Date(now.getTime() + 3600000);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const results: { startTime: Date; endTime: Date | null }[] = [];
  for (let day = 0; day < days; day++) {
    const date = new Date(midnight + day * 86400000);
    if (date.getUTCDay() !== schedule.dayOfWeek) continue;
    const startTime = new Date(date.getTime() + (schedule.startMinutes - 60) * 60000);
    if (startTime <= now) continue;
    results.push({ startTime, endTime: schedule.endMinutes === null ? null : new Date(date.getTime() + (schedule.endMinutes - 60) * 60000) });
  }
  return results;
}
