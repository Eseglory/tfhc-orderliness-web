'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '../../../../components/Navbar';
import { fetchApi } from '../../../../lib/api';
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const clock = (minutes: number | null) => minutes === null ? '' : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const minutes = (value: string) => value ? Number(value.split(':')[0]) * 60 + Number(value.split(':')[1]) : null;
type Schedule = { id?: string; title: string; dayOfWeek: number; startMinutes: number; endMinutes: number | null; categoryName: string; enabled: boolean };
export default function RecurringServicesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [edit, setEdit] = useState<Schedule | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  async function load() {
    try { const data = await fetchApi('/service-schedules'); setSchedules(data.schedules); setConfig(data.config); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load services'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function save(endpoint: string, body: any, method = 'PUT') {
    setSaving(true); setError(''); setSaved('');
    try { await fetchApi(endpoint, { method, body: JSON.stringify(body) }); setEdit(null); await load(); setSaved('Saved. Upcoming services have been updated.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save services'); }
    finally { setSaving(false); }
  }
  return <div className="min-h-screen bg-slate-950 text-white pb-12"><Navbar /><main className="max-w-5xl mx-auto p-4 space-y-6">
    <Link href="/admin/meetings" className="text-indigo-300">Back to meetings</Link>
    <h1 className="text-2xl font-bold">Recurring services</h1>
    <p>All times use Africa/Lagos. Upcoming services are generated four weeks ahead. Add or disable sessions to change how often a service runs.</p>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {saved && <p role="status" className="text-green-300">{saved}</p>}
    {loading ? <p>Loading services…</p> : <>
      <button className="bg-indigo-600 rounded p-3" onClick={() => { setSaved(''); setEdit({ title: '', dayOfWeek: 0, startMinutes: 420, endMinutes: null, categoryName: 'Sunday Service', enabled: true }); }}>Add session</button>
      <div className="grid gap-3 sm:grid-cols-2">{schedules.map(s => <section key={s.id} className="bg-slate-900 rounded-xl p-4 space-y-2">
        <h2 className="font-semibold">{s.title}</h2><p>{weekdays[s.dayOfWeek]} · {clock(s.startMinutes)}{s.endMinutes !== null ? ` – ${clock(s.endMinutes)}` : ' · End time not set'}</p>
        <p>{s.enabled ? 'Enabled' : 'Disabled'}</p><button className="text-indigo-300 underline" aria-label={`Edit ${s.title}`} onClick={() => { setSaved(''); setEdit({ ...s }); }}>Edit session</button>
      </section>)}</div>
      {config && <form className="bg-slate-900 p-4 rounded-xl space-y-4" onSubmit={e => { e.preventDefault(); void save('/service-schedules/config', config); }}>
        <h2 className="text-xl font-semibold">Venue and reminders</h2>
        <label className="block">Venue<input required className="block w-full bg-slate-800 p-2 rounded" value={config.venue.name} onChange={e => setConfig({ ...config, venue: { ...config.venue, name: e.target.value } })} /></label>
        <div className="grid sm:grid-cols-3 gap-3">{(['latitude', 'longitude', 'radiusMeters'] as const).map(k => <label key={k}>{k === 'radiusMeters' ? 'Check-in radius (metres)' : k}<input required type="number" step="any" className="block w-full bg-slate-800 p-2 rounded" value={config.venue[k]} onChange={e => setConfig({ ...config, venue: { ...config.venue, [k]: Number(e.target.value) } })} /></label>)}</div>
        <label className="block">Arrive minutes before service<input required type="number" min="0" max="180" className="block bg-slate-800 p-2 rounded" value={config.arrivalMinutesBefore} onChange={e => setConfig({ ...config, arrivalMinutesBefore: Number(e.target.value) })} /></label>
        <label className="block"><input type="checkbox" checked={config.remindersEnabled} onChange={e => setConfig({ ...config, remindersEnabled: e.target.checked })} /> Enable email reminders</label>
        <label className="block">Reminder minutes before service<input required type="number" min="1" max="10080" className="block bg-slate-800 p-2 rounded" value={config.reminderMinutes[0] || 60} onChange={e => setConfig({ ...config, reminderMinutes: [Number(e.target.value)] })} /></label>
        <label htmlFor="recipients">Send reminders to</label><select id="recipients" className="block bg-slate-800 p-2 rounded" value={config.recipients} onChange={e => setConfig({ ...config, recipients: e.target.value })}><option value="all">All active approved members</option><option value="committed">Only members committed to the service</option></select>
        <p className="text-sm text-slate-300">When an end time is unset, check-in closes 10 minutes after the start. Set the end time to extend that window. Saved changes apply to upcoming scheduled services; completed and active services keep their history.</p>
        <button disabled={saving} className="bg-indigo-600 rounded p-3">{saving ? 'Saving…' : 'Save settings'}</button>
      </form>}
    </>}
    {edit && <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"><form role="dialog" aria-modal="true" aria-labelledby="session-title" className="bg-slate-900 rounded-xl p-5 space-y-4 w-full max-w-md max-h-[90dvh] overflow-y-auto" onSubmit={e => { e.preventDefault(); void save(edit.id ? `/service-schedules/${edit.id}` : '/service-schedules', edit, edit.id ? 'PUT' : 'POST'); }}>
      <h2 id="session-title" className="text-xl font-bold">{edit.id ? 'Edit session' : 'Add session'}</h2>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      <label className="block">Title<input required maxLength={120} className="block w-full bg-slate-800 p-2 rounded" value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} /></label>
      <label htmlFor="session-day">Day</label><select id="session-day" className="block w-full bg-slate-800 p-2 rounded" value={edit.dayOfWeek} onChange={e => setEdit({ ...edit, dayOfWeek: Number(e.target.value) })}>{weekdays.map((v, i) => <option key={v} value={i}>{v}</option>)}</select>
      <label className="block">Start time<input required type="time" className="block w-full bg-slate-800 p-2 rounded" value={clock(edit.startMinutes)} onChange={e => setEdit({ ...edit, startMinutes: minutes(e.target.value) ?? 0 })} /></label>
      <label className="block">End time (optional)<input type="time" className="block w-full bg-slate-800 p-2 rounded" value={clock(edit.endMinutes)} onChange={e => setEdit({ ...edit, endMinutes: minutes(e.target.value) })} /></label>
      <label className="block">Category<input required maxLength={80} className="block w-full bg-slate-800 p-2 rounded" value={edit.categoryName} onChange={e => setEdit({ ...edit, categoryName: e.target.value })} /></label>
      <label className="block"><input type="checkbox" checked={edit.enabled} onChange={e => setEdit({ ...edit, enabled: e.target.checked })} /> Enabled</label>
      <div className="flex gap-3"><button disabled={saving} className="bg-indigo-600 rounded p-3">{saving ? 'Saving…' : 'Save session'}</button><button type="button" disabled={saving} onClick={() => { setEdit(null); setError(''); }}>Cancel</button></div>
    </form></div>}
  </main></div>;
}
