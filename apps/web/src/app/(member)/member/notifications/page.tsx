'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchApi } from '../../../../lib/api';
export default function NotificationsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function load() { try { setItems(await fetchApi('/members/me/notifications')); setError(''); } catch(e:any) { setError(e.message); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  async function markRead() {
    setSaving(true);
    try { await fetchApi('/members/me/notifications/read', {method:'PUT'}); await load(); }
    catch(e:any) { setError(e.message); } finally { setSaving(false); }
  }
  return <main className="max-w-3xl mx-auto p-5 pb-28 space-y-5">
    <Link href="/member">← Home</Link><h1 className="text-2xl font-bold">Activity</h1>
    <button onClick={load} className="underline">Refresh notifications</button>
    {error && <p role="alert">{error}</p>}
    {loading ? <p role="status">Loading activity…</p> : items.length === 0 ? <p>No notifications yet.</p> : <>
      <button onClick={markRead} disabled={saving || items.every(item=>item.status==='READ')} className="rounded-lg p-3 bg-primary text-on-primary disabled:opacity-50">Mark all as read</button>
      {items.map(item=><article key={item.id} className="p-4 rounded-xl bg-surface-container"><h2 className="font-bold break-words">{item.title}{item.status==='UNREAD' ? ' · Unread' : ''}</h2><p className="break-words">{item.body}</p><time>{new Date(item.createdAt).toLocaleString()}</time>{item.type === 'ABSENCE_DECISION' ? <Link className="block underline mt-2" href="/member/submit-excuse">View absence request</Link> : item.data?.meetingId ? <Link className="block underline mt-2" href={`/member/meetings/${encodeURIComponent(item.data.meetingId)}`}>View service</Link> : null}</article>)}
    </>}
  </main>;
}
