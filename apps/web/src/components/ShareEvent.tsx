'use client';

import { useState, useRef, useEffect } from 'react';
import { calendarFile, ShareableEvent } from '../lib/pwa/calendar';
import { buildAdvancedGoogleCalendarUrl, isOnlineUnitMeeting } from '../lib/calendar-integration';

export function ShareEvent({ event }: { event: ShareableEvent }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const getGoogleCalendarUrl = () => {
    return buildAdvancedGoogleCalendarUrl({
      id: event.id,
      title: event.title,
      description: event.description,
      notes: event.notes,
      startTime: event.startTime,
      endTime: event.endTime,
      locationName: event.locationName,
      virtualMeetingUrl: event.meetingUrl,
      mode: event.locationName?.toLowerCase().includes('online') || event.locationName?.toLowerCase().includes('virtual') || event.locationName?.toLowerCase().includes('google meet') || event.meetingUrl ? 'VIRTUAL' : 'IN_PERSON',
      recurrenceRule: event.recurrenceRule || (event.title.toLowerCase().includes('wednesday') && (event.isRecurring || event.title.toLowerCase().includes('weekly')) ? 'FREQ=WEEKLY;BYDAY=WE' : null),
      timezone: 'Africa/Lagos',
    });
  };

  const downloadIcs = () => {
    try {
      const icsContent = calendarFile(event);
      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${event.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.ics`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('✓ Calendar file (.ics) downloaded');
      setMenuOpen(false);
    } catch {
      showToast('Failed to download calendar file');
    }
  };

  const copyDetails = async () => {
    const timeStr = new Date(event.startTime).toLocaleString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const text = `📌 ${event.title}\n🕒 ${timeStr}\n📍 ${event.locationName || 'The Father’s House Church'}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        showToast('✓ Event details copied to clipboard!');
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
        showToast('✓ Event details copied!');
      }
      setMenuOpen(false);
    } catch {
      showToast('Could not copy to clipboard');
    }
  };

  const handleNativeShareOrMenu = async () => {
    // If mobile with native share support, try native share first
    const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (isMobile && typeof navigator.share === 'function') {
      try {
        const timeStr = new Date(event.startTime).toLocaleString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
        await navigator.share({
          title: event.title,
          text: `📌 ${event.title}\n🕒 ${timeStr}\n📍 ${event.locationName || 'The Father’s House Church'}`,
          url: window.location.href,
        });
        return;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return; // User dismissed share sheet
        }
        // Fall back to opening menu if native share fails
        setMenuOpen(true);
      }
    } else {
      // On desktop or when native share is unavailable, toggle the options menu
      setMenuOpen((prev) => !prev);
    }
  };

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        onClick={handleNativeShareOrMenu}
        className="flex items-center gap-1.5 px-3 py-2 min-h-10 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface border border-outline-variant/30 text-xs font-semibold transition-all duration-150 active:scale-95 shadow-xs"
        aria-label={`Share ${event.title}`}
        aria-expanded={menuOpen}
      >
        <span className="material-symbols-outlined text-[16px] text-primary">share</span>
        <span>Share</span>
      </button>

      {/* Dropdown Menu for Desktop & Fallbacks */}
      {menuOpen && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-56 rounded-2xl bg-surface-container-lowest border border-outline-variant/20 shadow-xl p-1.5 animate-in fade-in zoom-in-95 duration-100">
          {isOnlineUnitMeeting(event as any) && (
            <a
              href={getGoogleCalendarUrl()}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-on-surface rounded-xl hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined text-sm text-blue-600">event</span>
              <span>Add to Google Calendar</span>
            </a>
          )}

          <button
            onClick={downloadIcs}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-on-surface rounded-xl hover:bg-surface-container-high transition-colors text-left"
          >
            <span className="material-symbols-outlined text-sm text-emerald-600">download</span>
            <span>Download iCal (.ics)</span>
          </button>

          <button
            onClick={copyDetails}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-on-surface rounded-xl hover:bg-surface-container-high transition-colors text-left"
          >
            <span className="material-symbols-outlined text-sm text-amber-600">content_copy</span>
            <span>Copy Event Details</span>
          </button>
        </div>
      )}

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-20 right-4 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg animate-in fade-in slide-in-from-bottom-2">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
