'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '../../../../lib/api';

export default function SubmitExcusePage() {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      await fetchApi('/excuses', {
        method: 'POST',
        body: JSON.stringify({
          meetingId: 'm-1',
          reason: `${reason}: ${details}`,
        }),
      });
      setMessage('Excuse submitted for review.');
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
    <div className="bg-background text-on-background min-h-screen font-body-md antialiased pb-safe">
      {/* Top Navigation Area matching Stitch Screen 12 */}
      <header className="flex items-center w-full px-edge-margin h-16 bg-background sticky top-0 z-40 border-b border-outline-variant/10">
        <button
          onClick={() => router.back()}
          aria-label="Go back"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors text-on-surface"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="flex-1 text-center font-headline-sm text-headline-sm font-bold text-primary mr-10">Submit Excuse</h1>
      </header>

      <main className="px-edge-margin py-stack-md max-w-2xl mx-auto space-y-section-gap">
        {/* Context Header Card matching Stitch Screen 12 */}
        <section className="bg-surface-container-lowest rounded-xl p-stack-md shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-surface-container-low relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-secondary-container"></div>
          <h2 className="font-headline-sm text-headline-sm text-primary mb-stack-sm font-bold">Absence Request</h2>
          <div className="flex items-start gap-stack-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-outline mt-0.5">event</span>
            <div>
              <p className="font-body-md text-body-md text-on-surface font-semibold">Midweek Prayer &amp; Rehearsal</p>
              <p className="font-label-md text-label-md text-outline mt-1">Thursday, Aug 13, 2026 • 7:00 PM</p>
            </div>
          </div>
        </section>

        {message && (
          <div className="p-3 rounded-lg bg-secondary/10 text-secondary font-label-md text-label-md text-center">
            {message}
          </div>
        )}

        {/* Form Area matching Stitch Screen 12 */}
        <form className="space-y-stack-lg" onSubmit={handleSubmit}>
          {/* Reason Dropdown */}
          <div className="space-y-stack-sm">
            <label className="block font-label-md text-label-md text-on-surface font-semibold" htmlFor="reason">
              Reason for Absence
            </label>
            <div className="relative">
              <select
                id="reason"
                name="reason"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full appearance-none bg-surface-container-lowest border border-outline-variant text-on-surface font-body-md text-body-md rounded-lg pl-3 pr-10 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              >
                <option value="" disabled>Select a reason...</option>
                <option value="illness">Illness / Medical</option>
                <option value="travel">Travel out of town</option>
                <option value="work">Work scheduling conflict</option>
                <option value="family">Family emergency</option>
                <option value="other">Other</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-outline">
                <span className="material-symbols-outlined">expand_more</span>
              </div>
            </div>
          </div>

          {/* Detailed Explanation Textarea */}
          <div className="space-y-stack-sm">
            <label className="block font-label-md text-label-md text-on-surface font-semibold" htmlFor="details">
              Detailed Explanation
            </label>
            <textarea
              id="details"
              name="details"
              rows={4}
              required
              maxLength={300}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Please provide specific details regarding your absence..."
              className="w-full bg-surface-container-lowest border border-outline-variant text-on-surface font-body-md text-body-md rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
            />
            <p className="font-label-sm text-label-sm text-outline-variant text-right">
              {details.length}/300 characters
            </p>
          </div>

          {/* Document Upload */}
          <div className="space-y-stack-sm">
            <label className="block font-label-md text-label-md text-on-surface font-semibold">
              Supporting Documentation (Optional)
            </label>
            <p className="font-body-md text-body-md text-on-surface-variant text-sm mb-2">
              Upload medical notes, travel confirmations, etc.
            </p>
            <div className="border-2 border-dashed border-outline-variant rounded-xl p-stack-lg flex flex-col items-center justify-center text-center bg-surface-container hover:bg-surface-container-high transition-colors cursor-pointer group">
              <div className="w-12 h-12 bg-primary-container rounded-full flex items-center justify-center mb-stack-sm group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-on-primary-container">upload_file</span>
              </div>
              <p className="font-body-md text-body-md text-primary font-semibold">Tap to upload file</p>
              <p className="font-label-sm text-label-sm text-outline mt-1">PDF, JPG, or PNG up to 5MB</p>
            </div>
          </div>

          {/* Audit Notice Card */}
          <div className="bg-surface-container-low rounded-lg p-stack-md flex gap-stack-sm border border-surface-variant">
            <span className="material-symbols-outlined text-secondary-container mt-0.5">info</span>
            <p className="font-body-md text-body-md text-on-surface-variant">
              All absence excuses are subject to review by leadership. You will be notified once a decision has been made.
            </p>
          </div>

          <div className="pt-stack-md pb-stack-lg">
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary text-on-primary font-headline-sm text-headline-sm py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-on-background transition-colors shadow-sm active:scale-[0.98] disabled:opacity-50 font-bold"
            >
              <span>{submitting ? 'Submitting...' : 'Submit Excuse for Review'}</span>
              <span className="material-symbols-outlined text-on-primary text-sm">arrow_forward</span>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
