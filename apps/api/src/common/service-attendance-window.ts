/** Church services open for clock-in 25 minutes before their scheduled start. */
export function serviceAttendanceOpenTime(
  start: Date | string,
  fallback: Date | string,
  eventTypeKey?: string | null,
  categoryName?: string | null,
  isOnline = false,
): Date {
  if (isOnline) return new Date(start);
  const isService = ['SERVICE', 'SPECIAL_SERVICE'].includes(eventTypeKey || '') ||
    ['Sunday Service', 'Midweek Service', 'Special Programme'].includes(categoryName || '');
  return isService ? new Date(new Date(start).getTime() - 25 * 60000) : new Date(fallback);
}
