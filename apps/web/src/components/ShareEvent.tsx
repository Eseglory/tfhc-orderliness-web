'use client';
import { useState } from 'react';
import { calendarFile, ShareableEvent } from '../lib/pwa/calendar';

export function ShareEvent({ event }: { event: ShareableEvent }) {
  const [status, setStatus] = useState('');
  const share = async () => {
    try {
      const file = new File([calendarFile(event)], 'tfhc-event.ics', { type: 'text/calendar' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: event.title, files: [file] });
      } else if (navigator.share) {
        await navigator.share({ title: event.title, text: `${event.title}\n${new Date(event.startTime).toLocaleString()}\n${event.locationName || ''}` });
      } else {
        const url = URL.createObjectURL(file);
        const link = document.createElement('a'); link.href = url; link.download = file.name;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus('Calendar file downloaded.');
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') setStatus('Sharing is unavailable. Try again in a supported browser.');
    }
  };
  return <div><button onClick={share} className="px-3 py-2 min-h-11 rounded-xl bg-surface-container text-xs font-semibold" aria-label={`Share ${event.title}`}>Share event</button>
    {status && <p role="status" className="text-xs max-w-48">{status}</p>}
  </div>;
}
