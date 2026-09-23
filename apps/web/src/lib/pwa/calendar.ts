export type ShareableEvent = {
  id: string;
  title: string;
  startTime: string;
  endTime: string | null;
  locationName: string | null;
  description?: string | null;
  notes?: string | null;
  meetingUrl?: string | null;
  recurrenceRule?: string | null;
  isRecurring?: boolean;
};
const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/\r/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const stamp = (date: string) => new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function fold(line: string) {
  let result = ''; let bytes = 0;
  for (const character of line) {
    const length = new TextEncoder().encode(character).length;
    if (bytes + length > 75) { result += '\r\n '; bytes = 1; }
    result += character; bytes += length;
  }
  return result;
}
export function calendarFile(event: ShareableEvent, now = new Date()): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TFHC//Tracker//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${escape(event.id)}@tfhc-tracker`, `DTSTAMP:${stamp(now.toISOString())}`,
    `DTSTART:${stamp(event.startTime)}`, ...(event.endTime ? [`DTEND:${stamp(event.endTime)}`] : []),
    `SUMMARY:${escape(event.title)}`, `LOCATION:${escape(event.locationName || '')}`,
    'END:VEVENT', 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}
