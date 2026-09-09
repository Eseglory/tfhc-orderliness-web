'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '../../../../lib/api';

export default function CorrectionRequestPage() {
  const router = useRouter();
  const [meetingId, setMeetingId] = useState('');
  const [meetings, setMeetings] = useState<any[]>([]);
  const [claimedTime, setClaimedTime] = useState('08:48');
  const [reasonCategory, setReasonCategory] = useState('gps');
  const [statement, setStatement] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchApi('/meetings')
      .then((data) => setMeetings(data))
      .catch((err) => setMessage(err.message || 'Unable to load meetings.'));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      await fetchApi('/excuses/corrections', {
        method: 'POST',
        body: JSON.stringify({
          meetingId,
          requestedStatus: 'ON_TIME',
          reason: `[${reasonCategory}] Claimed arrival time: ${claimedTime}. ${statement}`.trim(),
        }),
      });
      setMessage('Correction request submitted!');
      setTimeout(() => {
        router.push('/member/my-attendance');
      }, 1500);
    } catch (err: any) {
      setMessage(err.message || 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-background text-on-background min-h-screen font-body-md pt-safe pb-safe antialiased">
      {/* TopAppBar matching Stitch Screen 13 */}
      <header className="bg-background flex justify-between items-center w-full px-edge-margin h-16 sticky top-0 z-40 border-b border-outline-variant/10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="text-on-surface-variant hover:opacity-80 transition-all duration-200 active:scale-95 flex items-center justify-center p-2 -ml-2 rounded-full"
          >
            <span className="material-symbols-outlined text-2xl">arrow_back</span>
          </button>
          <h1 className="font-headline-sm text-headline-sm font-bold text-primary">Correction</h1>
        </div>
      </header>

      <main className="px-edge-margin pt-stack-md pb-section-gap flex flex-col gap-stack-lg max-w-2xl mx-auto">
        {/* Header Section */}
        <section className="flex flex-col gap-stack-sm">
          <h2 className="font-headline-md text-headline-md text-on-surface font-bold">Request Attendance Correction</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Submit a formal request to adjust an attendance record. All requests are subject to leadership review.
          </p>
        </section>

        {message && (
          <div className="p-3 rounded-lg bg-secondary/10 text-secondary font-label-md text-label-md text-center font-bold">
            {message}
          </div>
        )}

        {/* Form Section matching Stitch Screen 13 */}
        <form className="flex flex-col gap-section-gap" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-stack-md">
            {/* Meeting Selection Card */}
            <div className="bg-surface-container-lowest rounded-xl p-stack-md shadow-[0px_2px_8px_rgba(0,0,0,0.05)] flex flex-col gap-stack-sm border border-outline-variant/20">
              <label className="font-label-md text-label-md text-on-surface uppercase font-bold" htmlFor="meeting-select">
                Select Meeting
              </label>
              <div className="relative">
                <select
                  id="meeting-select"
                  required
                  value={meetingId}
                  onChange={(e) => setMeetingId(e.target.value)}
                  className="w-full appearance-none bg-transparent border border-outline-variant rounded-lg px-4 py-3 font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="" disabled>Choose a recent meeting...</option>
                  {meetings.map((meeting) => (
                    <option key={meeting.id} value={meeting.id}>
                      {meeting.title} — {new Date(meeting.startTime).toLocaleDateString()}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-outline">
                  <span className="material-symbols-outlined">expand_more</span>
                </div>
              </div>
            </div>

            {/* Claimed Time Card */}
            <div className="bg-surface-container-lowest rounded-xl p-stack-md shadow-[0px_2px_8px_rgba(0,0,0,0.05)] flex flex-col gap-stack-sm border border-outline-variant/20">
              <label className="font-label-md text-label-md text-on-surface uppercase font-bold" htmlFor="claimed-time">
                Claimed Time of Arrival
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                  <span className="material-symbols-outlined text-outline">schedule</span>
                </div>
                <input
                  id="claimed-time"
                  type="time"
                  required
                  value={claimedTime}
                  onChange={(e) => setClaimedTime(e.target.value)}
                  className="w-full bg-transparent border border-outline-variant rounded-lg pl-12 pr-4 py-3 font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Reason Radio Group Card matching Stitch Screen 13 */}
            <div className="bg-surface-container-lowest rounded-xl p-stack-md shadow-[0px_2px_8px_rgba(0,0,0,0.05)] flex flex-col gap-stack-sm border border-outline-variant/20">
              <span className="font-label-md text-label-md text-on-surface uppercase font-bold">Reason for Correction</span>
              <div className="flex flex-col gap-3 mt-2">
                {/* Option 1 */}
                <label className="flex items-start cursor-pointer w-full group gap-3 p-2 rounded hover:bg-surface-container-low">
                  <input
                    type="radio"
                    name="reason"
                    value="gps"
                    checked={reasonCategory === 'gps'}
                    onChange={(e) => setReasonCategory(e.target.value)}
                    className="mt-1"
                  />
                  <div className="flex flex-col">
                    <span className="font-body-md text-body-md font-bold text-on-surface">GPS Error</span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Location services failed to verify presence.</span>
                  </div>
                </label>

                {/* Option 2 */}
                <label className="flex items-start cursor-pointer w-full group gap-3 p-2 rounded hover:bg-surface-container-low">
                  <input
                    type="radio"
                    name="reason"
                    value="scan"
                    checked={reasonCategory === 'scan'}
                    onChange={(e) => setReasonCategory(e.target.value)}
                    className="mt-1"
                  />
                  <div className="flex flex-col">
                    <span className="font-body-md text-body-md font-bold text-on-surface">Arrived but couldn&apos;t scan</span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Technical difficulty with location access or device.</span>
                  </div>
                </label>

                {/* Option 3 */}
                <label className="flex items-start cursor-pointer w-full group gap-3 p-2 rounded hover:bg-surface-container-low">
                  <input
                    type="radio"
                    name="reason"
                    value="late"
                    checked={reasonCategory === 'late'}
                    onChange={(e) => setReasonCategory(e.target.value)}
                    className="mt-1"
                  />
                  <div className="flex flex-col">
                    <span className="font-body-md text-body-md font-bold text-on-surface">Recorded Late incorrectly</span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">System logged time inaccurately.</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Statement Box Card */}
            <div className="bg-surface-container-lowest rounded-xl p-stack-md shadow-[0px_2px_8px_rgba(0,0,0,0.05)] flex flex-col gap-stack-sm border border-outline-variant/20">
              <label className="font-label-md text-label-md text-on-surface uppercase flex justify-between items-center font-bold" htmlFor="statement">
                <span>Supporting Statement</span>
                <span className="text-on-surface-variant font-normal normal-case">Optional</span>
              </label>
              <textarea
                id="statement"
                rows={3}
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                placeholder="Provide witness names or a brief explanation..."
                className="w-full bg-transparent border border-outline-variant rounded-lg px-4 py-3 font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
              />
            </div>

            {/* Warning Banner */}
            <div className="bg-surface-container-low border border-primary-fixed-dim rounded-lg p-stack-sm flex gap-3 items-start mt-stack-sm">
              <span className="material-symbols-outlined text-on-surface-variant flex-shrink-0 mt-0.5">info</span>
              <p className="font-label-sm text-label-sm text-on-surface-variant leading-relaxed">
                <strong>Audited Logs:</strong> All correction requests are permanently logged and reviewed against system data and access points by leadership to maintain integrity.
              </p>
            </div>
          </div>

          {/* Action Area */}
          <div className="flex flex-col gap-stack-sm mt-auto pt-section-gap">
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary text-on-primary font-headline-sm text-headline-sm py-4 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-opacity active:scale-[0.98] disabled:opacity-50 font-bold"
            >
              <span className="material-symbols-outlined">send</span>
              {submitting ? 'Submitting...' : 'Submit Correction Request'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="w-full bg-transparent border border-outline-variant text-on-surface font-body-md text-body-md font-medium py-3 rounded-xl hover:bg-surface-container-low transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
