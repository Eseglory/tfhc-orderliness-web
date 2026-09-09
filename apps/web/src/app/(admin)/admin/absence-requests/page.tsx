'use client';
import { useEffect, useState } from 'react';
import { Navbar } from '../../../../components/Navbar';
import { fetchApi } from '../../../../lib/api';

export default function AbsenceRequestsPage() {
  const [kind, setKind] = useState<'absence' | 'correction'>('absence');
  const endpoint = kind === 'absence' ? '/excuses' : '/excuses/corrections';
  const [requests, setRequests] = useState<any[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const load = async () => {
    try { setRequests(await fetchApi(`${endpoint}/pending`)); setError(''); }
    catch (err: any) { setError(err.message || 'Could not load requests'); }
    finally { setLoading(false); }
  };
  useEffect(() => { setLoading(true); setRequests([]); load(); }, [kind]);
  const review = async (id: string, status: string) => {
    setBusy(id);
    try {
      await fetchApi(`${endpoint}/${id}/review`, {method:'PUT', body:JSON.stringify({status, reviewNote:notes[id] || undefined})});
      await load();
    } catch (err: any) { setError(err.message || 'Could not save decision'); }
    finally { setBusy(null); }
  };
  return <div className="min-h-screen bg-slate-950 text-white"><Navbar />
    <main className="max-w-4xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Absence requests</h1>
      <label>Request type <select className="bg-slate-800 p-2" value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="absence">Absence requests</option><option value="correction">Attendance corrections</option></select></label>
      <p>Review members’ requests to be excused. Approval records the absence as excused.</p>
      {error && <p role="alert">{error}</p>}
      <button onClick={load} className="underline">Refresh requests</button>
      {loading ? <p>Loading requests…</p> : requests.length === 0 && <p>No pending requests.</p>}
      {requests.map(request => <article key={request.id} className="border border-slate-700 rounded-xl p-4 space-y-3">
        <h2 className="font-bold">{request.member.firstName} {request.member.lastName} — {request.meeting.title}</h2>
        <p>{new Date(request.meeting.startTime).toLocaleString()}</p>
        <p>{request.reason}</p>{request.requestedStatus && <p>Requested status: {request.requestedStatus}</p>}
        <label className="block">Review note (optional)<textarea maxLength={2000} value={notes[request.id] || ''} onChange={e => setNotes({...notes, [request.id]:e.target.value})} className="block w-full bg-slate-800 rounded p-2" /></label>
        <div className="flex gap-3">
          <button disabled={busy !== null} onClick={() => review(request.id, 'APPROVED')} className="bg-green-700 rounded px-4 py-2">Approve</button>
          <button disabled={busy !== null} onClick={() => review(request.id, 'REJECTED')} className="bg-red-700 rounded px-4 py-2">Reject</button>
        </div>
      </article>)}
    </main>
  </div>;
}
