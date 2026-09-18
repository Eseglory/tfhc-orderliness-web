'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { enqueueNotificationReads } from '../../../../lib/pwa/queue';
import { PushSettings } from '../../../../components/PushSettings';
import { fetchApi } from '../../../../lib/api';

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  async function load() {
    try {
      setItems(await fetchApi('/members/me/notifications'));
      setError('');
    } catch (e: any) {
      setError(e.message || 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const refresh = () => {
      if (navigator.onLine) void load();
    };
    const synced = () => {
      setNotice('Sync completed.');
      refresh();
    };
    window.addEventListener('online', refresh);
    window.addEventListener('tfhc:notifications-synced', synced);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('tfhc:notifications-synced', synced);
    };
  }, []);

  async function markRead() {
    setSaving(true);
    try {
      const ids = items.filter((item) => item.status === 'UNREAD').map((item) => item.id);
      if (!ids.length) return;
      if (!navigator.onLine) {
        await enqueueNotificationReads(ids);
        setNotice('Changes pending. These notifications will be marked read when the app reconnects.');
      } else {
        try {
          await fetchApi('/members/me/notifications/read', {
            method: 'PUT',
            body: JSON.stringify({ ids }),
            signal: AbortSignal.timeout(15000),
          });
          setNotice('All notifications marked as read.');
          await load();
        } catch (failure: any) {
          if (failure.status && failure.status < 500 && ![408, 429].includes(failure.status)) throw failure;
          await enqueueNotificationReads(ids);
          setNotice('Changes pending. The app will retry these notification reads.');
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const unreadCount = items.filter((item) => item.status === 'UNREAD').length;

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col font-body-md pb-28 antialiased">
      {/* Top App Bar */}
      <header className="flex justify-between items-center w-full px-edge-margin h-16 bg-background top-0 z-40 sticky border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center transition-all duration-200 active:scale-95 hover:opacity-80"
            aria-label="Go back"
          >
            <span className="material-symbols-outlined text-on-surface-variant">arrow_back</span>
          </button>
          <div className="flex items-center gap-2">
            <h1 className="font-headline-sm text-headline-sm font-bold text-primary">Notifications</h1>
            {unreadCount > 0 && (
              <span className="rounded-full bg-error px-2 py-0.5 font-label-sm text-xs font-bold text-on-error">
                {unreadCount} new
              </span>
            )}
          </div>
        </div>
        {items.length > 0 && unreadCount > 0 && (
          <button
            onClick={markRead}
            disabled={saving}
            className="text-xs font-bold text-primary hover:underline px-2 py-1 rounded bg-primary/10 disabled:opacity-50"
          >
            {saving ? 'Marking…' : 'Mark all read'}
          </button>
        )}
      </header>

      <main className="flex-1 px-edge-margin py-stack-md flex flex-col gap-section-gap w-full max-w-3xl mx-auto">
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 p-4 shadow-xs">
          <PushSettings />
        </div>

        {notice && (
          <div className="p-3 rounded-lg bg-secondary/10 text-secondary text-sm font-semibold text-center">
            {notice}
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-error-container text-on-error-container text-center">
            <p role="alert">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
            <p className="font-body-md">Loading activity…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-center text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl text-outline-variant">notifications_off</span>
            <p className="font-body-md">No notifications yet.</p>
            <p className="text-xs text-outline">You’re all caught up with recent events and updates.</p>
          </div>
        ) : (
          <section className="space-y-3">
            {items.map((item) => (
              <article
                key={item.id}
                className={`p-4 rounded-xl border transition-all ${
                  item.status === 'UNREAD'
                    ? 'bg-surface-container-lowest border-primary/40 shadow-xs ring-1 ring-primary/20'
                    : 'bg-surface-container-lowest border-outline-variant/30 opacity-90'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`material-symbols-outlined text-xl ${
                        item.type === 'ABSENCE_DECISION'
                          ? 'text-secondary'
                          : item.type === 'ANNOUNCEMENT'
                          ? 'text-primary'
                          : 'text-tertiary'
                      }`}
                    >
                      {item.type === 'ABSENCE_DECISION'
                        ? 'verified'
                        : item.type === 'ANNOUNCEMENT'
                        ? 'campaign'
                        : 'notifications'}
                    </span>
                    <h2 className="font-headline-sm text-sm font-bold text-primary break-words">
                      {item.title}
                    </h2>
                  </div>
                  {item.status === 'UNREAD' && (
                    <span className="h-2 w-2 rounded-full bg-error shrink-0 mt-1" />
                  )}
                </div>

                <p className="mt-2 font-body-md text-sm text-on-surface break-words leading-relaxed">
                  {item.body}
                </p>

                <div className="mt-3 pt-2 border-t border-outline-variant/10 flex items-center justify-between text-xs text-on-surface-variant">
                  <time>{new Date(item.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time>
                  {item.type === 'ABSENCE_DECISION' ? (
                    <Link
                      className="font-bold text-primary hover:underline inline-flex items-center gap-0.5"
                      href="/member/submit-excuse"
                    >
                      View Request <span className="material-symbols-outlined text-sm">chevron_right</span>
                    </Link>
                  ) : item.data?.meetingId ? (
                    <Link
                      className="font-bold text-primary hover:underline inline-flex items-center gap-0.5"
                      href={`/member/meetings/${encodeURIComponent(item.data.meetingId)}`}
                    >
                      View Service <span className="material-symbols-outlined text-sm">chevron_right</span>
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
