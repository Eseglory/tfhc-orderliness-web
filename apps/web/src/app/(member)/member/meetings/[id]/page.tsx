'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchApi } from '../../../../../lib/api';
import { Navbar } from '../../../../../components/Navbar';
import { Calendar, Clock, MapPin, QrCode, ArrowLeft, ShieldCheck, Award } from 'lucide-react';

export default function MeetingDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [meeting, setMeeting] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      loadMeetingDetails(params.id as string);
    }
  }, [params.id]);

  const loadMeetingDetails = async (id: string) => {
    try {
      const data = await fetchApi(`/meetings/${id}`);
      setMeeting(data);
    } catch (err: any) {
      console.error('Failed to load meeting details:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!meeting && !loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
        <Navbar />
        <div className="p-8 text-center text-slate-400">Meeting session not found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24">
      <Navbar />

      <main className="max-w-md mx-auto sm:max-w-xl md:max-w-7xl px-4 py-6 space-y-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Meetings
        </button>

        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden shadow-xl space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 mb-2 inline-block">
                {meeting?.category?.name || 'Unit Session'}
              </span>
              <h1 className="text-xl font-bold text-white mb-1">{meeting?.title || 'Saturday Unit Meeting'}</h1>
              <p className="text-xs text-slate-400">Official TFHC Attendance Session</p>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${meeting?.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'}`}>
              {meeting?.status || 'SCHEDULED'}
            </span>
          </div>

          <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 space-y-3 text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-2"><Calendar className="w-4 h-4 text-amber-400" /> Date:</span>
              <span className="font-bold text-white">{meeting?.meetingDate ? new Date(meeting.meetingDate).toLocaleDateString() : 'Today'}</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-amber-400" /> Expected Arrival:</span>
              <span className="font-bold text-white">{meeting?.expectedArrivalTime ? new Date(meeting.expectedArrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '9:00 AM'}</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-amber-400" /> Venue &amp; Geofence:</span>
              <span className="font-bold text-white">{meeting?.locationName || 'Auditorium'} ({meeting?.geofenceRadiusMeters || 100}m)</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-2"><Award className="w-4 h-4 text-amber-400" /> Award Points:</span>
              <span className="font-bold text-amber-400">+{meeting ? meeting.pointWeight * 10 : 10} pts</span>
            </div>
          </div>

          <button
            onClick={() => router.push('/member/check-in')}
            className="w-full py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
          >
            <QrCode className="w-5 h-5" />
            <span>Proceed to QR Check-In</span>
          </button>
        </section>
      </main>
    </div>
  );
}
