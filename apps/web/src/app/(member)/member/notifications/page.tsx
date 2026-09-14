'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { enqueueNotificationReads } from '../../../../lib/pwa/queue';
import { PushSettings } from '../../../../components/PushSettings';
import { fetchApi } from '../../../../lib/api';
export default function NotificationsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  async function load() { try { setItems(await fetchApi('/members/me/notifications')); setError(''); } catch(e:any) { setError(e.message); } finally { setLoading(false); } }
  useEffect(() => { load();
    const refresh = () => { if (navigator.onLine) void load(); };
    const synced = () => { setNotice('Sync completed.'); refresh(); };
    window.addEventListener('online', refresh);
    window.addEventListener('tfhc:notifications-synced', synced);
    return () => { window.removeEventListener('online', refresh); window.removeEventListener('tfhc:notifications-synced', synced); };
  }, []);
  async function markRead() {
    setSaving(true);
    try {
      const ids = items.filter(item => item.status === 'UNREAD').map(item => item.id);
      if (!navigator.onLine) {
        await enqueueNotificationReads(ids);
        setNotice('Changes pending. These notifications will be marked read when the app reconnects.');
      } else {
        try {
          await fetchApi('/members/me/notifications/read', {method:'PUT', body: JSON.stringify({ ids }), signal: AbortSignal.timeout(15000)});
          setNotice('Notifications marked as read.'); await load();
        } catch (failure: any) {
          if (failure.status && failure.status < 500 && ![408, 429].includes(failure.status)) throw failure;
          await enqueueNotificationReads(ids);
          setNotice('Changes pending. The app will retry these notification reads.');
        }
      }
    }
    catch(e:any) { setError(e.message); } finally { setSaving(false); }
  }
  return <main className="max-w-3xl mx-auto p-5 pb-28 space-y-5">
    <Link href="/member">← Home</Link><h1 className="text-2xl font-bold">Activity</h1>
    <PushSettings />
    {notice && <p role="status">{notice}</p>}
    <button onClick={load} className="underline">Refresh notifications</button>
    {error && <p role="alert">{error}</p>}
    {loading ? <p role="status">Loading activity…</p> : items.length === 0 ? <p>No notifications yet.</p> : <>
      <button onClick={markRead} disabled={saving || items.every(item=>item.status==='READ')} className="rounded-lg p-3 bg-primary text-on-primary disabled:opacity-50">Mark all as read</button>
      {items.map(item=><article key={item.id} className="p-4 rounded-xl bg-surface-container"><h2 className="font-bold break-words">{item.title}{item.status==='UNREAD' ? ' · Unread' : ''}</h2><p className="break-words">{item.body}</p><time>{new Date(item.createdAt).toLocaleString()}</time>{item.type === 'ABSENCE_DECISION' ? <Link className="block underline mt-2" href="/member/submit-excuse">View absence request</Link> : item.data?.meetingId ? <Link className="block underline mt-2" href={`/member/meetings/${encodeURIComponent(item.data.meetingId)}`}>View service</Link> : null}</article>)}
    </>}
  </main>;
}
