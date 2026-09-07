'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchApi } from '../../../../lib/api';
import { LogoIcon } from '../../../../components/LogoIcon';

export default function MyAttendancePage() {
  const router = useRouter();
  const [history, setHistory] = useState<any[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);

  // Modals
  const [showExcuseModal, setShowExcuseModal] = useState(false);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [reason, setReason] = useState('');
  const [correctionNote, setCorrectionNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchApi('/attendance/my-history')
      .then((data) => setHistory(data))
      .catch((err) => console.error(err));
  }, []);

  const handleSubmitExcuse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;
    setSubmitting(true);
    setMessage('');
    try {
      await fetchApi('/excuses', {
        method: 'POST',
        body: JSON.stringify({
          meetingId: selectedRecord.meetingId,
          reason,
          category: 'General',
        }),
      });
      setMessage('Excuse submitted successfully!');
      setTimeout(() => {
        setShowExcuseModal(false);
        setReason('');
        setMessage('');
      }, 1500);
    } catch (err: any) {
      setMessage(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;
    setSubmitting(true);
    setMessage('');
    try {
      await fetchApi('/excuses/corrections', {
        method: 'POST',
        body: JSON.stringify({
          meetingId: selectedRecord.meetingId,
          requestedStatus: 'ON_TIME',
          reason: correctionNote,
        }),
      });
      setMessage('Correction request submitted!');
      setTimeout(() => {
        setShowCorrectionModal(false);
        setCorrectionNote('');
        setMessage('');
      }, 1500);
    } catch (err: any) {
      setMessage(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const attendedCount = history.filter((h) => ['EARLY', 'ON_TIME', 'GRACE_PERIOD', 'LATE'].includes(h.status)).length;
  const totalCount = history.length;
  const attendanceRate = ((attendedCount / (totalCount || 1)) * 100).toFixed(1);

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col relative pb-32 font-body-md">
      {/* TopAppBar matching Stitch Screen 8 */}
      <header className="flex justify-between items-center w-full px-edge-margin h-16 bg-background top-0 z-40 relative border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center transition-all duration-200 active:scale-95 hover:opacity-80"
          >
            <span className="material-symbols-outlined text-on-surface-variant">arrow_back</span>
          </button>
          <h1 className="font-headline-sm text-headline-sm font-bold text-primary">History</h1>
        </div>
        <div>
          <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center overflow-hidden border border-outline-variant p-1">
            <LogoIcon alt="User avatar" className="w-full h-full object-contain" />
          </div>
        </div>
      </header>

      {/* Main Content Canvas matching Stitch Screen 8 */}
      <main className="flex-1 px-edge-margin w-full max-w-3xl mx-auto space-y-section-gap pt-stack-md">
        {/* Controls & Summary */}
        <section className="space-y-stack-md">
          <div className="flex justify-between items-end">
            <h2 className="font-headline-md text-headline-md text-primary font-bold">Attendance Record</h2>
            <div className="relative inline-block text-left">
              <button className="inline-flex justify-center w-full rounded-lg border border-outline bg-surface px-4 py-2 text-body-md font-body-md font-semibold text-on-surface hover:bg-surface-container items-center gap-2">
                August 2026
                <span className="material-symbols-outlined text-[20px]">arrow_drop_down</span>
              </button>
            </div>
          </div>

          {/* Summary Bar matching Stitch Screen 8 */}
          <div className="bg-surface-container-lowest rounded-xl p-stack-md shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-outline-variant flex justify-between items-center">
            <div className="flex flex-col">
              <span className="font-label-md text-label-md text-on-surface-variant uppercase">Attended</span>
              <div className="flex items-baseline gap-1">
                <span className="font-headline-lg text-headline-lg text-primary font-bold">{attendedCount}</span>
                <span className="font-body-md text-body-md text-on-surface-variant">/ {totalCount}</span>
              </div>
            </div>
            <div className="h-10 w-[1px] bg-outline-variant"></div>
            <div className="flex flex-col items-end">
              <span className="font-label-md text-label-md text-on-surface-variant uppercase">Rate</span>
              <span className="font-headline-lg text-headline-lg text-tertiary-container font-bold">{attendanceRate}%</span>
            </div>
          </div>
        </section>

        {/* List Feed matching Stitch Screen 8 */}
        <section className="space-y-gutter">
          {history.length > 0 ? (
            history.map((record) => {
              const status = record.status;
              const title = record.meeting?.title || 'Meeting';
              const dateStr = record.actualArrivalTime ? new Date(record.actualArrivalTime).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'No check-in';
              const pts = record.pointsEarned || 0;

              return (
                <div
                  key={record.id}
                  className="bg-surface-container-lowest rounded-xl p-stack-md shadow-[0px_2px_8px_rgba(0,0,0,0.05)] flex flex-col gap-3 transition-transform duration-200 active:scale-[0.98] border border-outline-variant/20 mb-3"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                        status === 'ON_TIME'
                          ? 'bg-tertiary-container/10 text-tertiary-container'
                          : status === 'EARLY'
                          ? 'bg-primary-fixed text-on-primary-fixed'
                          : status === 'LATE'
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-surface-container-high text-outline'
                      }`}
                    >
                      <span className="material-symbols-outlined">
                        {status === 'ON_TIME' ? 'check_circle' : status === 'EARLY' ? 'alarm_on' : status === 'LATE' ? 'schedule' : 'cancel'}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-headline-sm text-headline-sm text-primary truncate leading-tight font-bold">{title}</h3>
                        <span
                          className={`font-label-md text-label-md px-2 py-0.5 rounded-full shrink-0 ml-2 border uppercase font-bold ${
                            status === 'ON_TIME'
                              ? 'text-tertiary-container bg-tertiary-container/10 border-tertiary-container/20'
                              : status === 'EARLY'
                              ? 'text-on-primary-fixed bg-primary-fixed border-on-primary-fixed/20'
                              : status === 'LATE'
                              ? 'text-on-error-container bg-error-container border-on-error-container/20'
                              : 'text-on-surface-variant bg-surface-container-high border-outline-variant'
                          }`}
                        >
                          {status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex justify-between items-center w-full">
                        <div className="flex items-center gap-1 text-on-surface-variant font-body-md text-body-md">
                          <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                          <span>{dateStr}</span>
                        </div>
                        <span className="font-label-md text-label-md text-primary font-bold">+{pts} pts</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions matching Stitch Screen 8 & Screen 9/10 modals */}
                  <div className="flex gap-2 pt-2 border-t border-outline-variant/20">
                    {status === 'ABSENT' && (
                      <button
                        onClick={() => {
                          setSelectedRecord(record);
                          setShowExcuseModal(true);
                        }}
                        className="flex-1 py-2 px-3 rounded-lg border border-outline-variant text-primary font-label-md text-label-md hover:bg-surface-container transition-colors flex items-center justify-center gap-2 font-semibold"
                      >
                        <span className="material-symbols-outlined text-[18px]">edit_document</span>
                        Submit Excuse
                      </button>
                    )}
                    {status !== 'ABSENT' && (
                      <button
                        onClick={() => {
                          setSelectedRecord(record);
                          setShowCorrectionModal(true);
                        }}
                        className="flex-1 py-2 px-3 rounded-lg border border-outline-variant text-on-surface-variant font-label-md text-label-md hover:bg-surface-container transition-colors flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[18px]">rule</span>
                        Request Correction
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="p-5 text-center">No attendance records yet.</p>
          )}
        </section>
      </main>

      {/* Submit Excuse Modal matching Stitch Screen 9 (submit_excuse/code.html) */}
      {showExcuseModal && (
        <div className="fixed inset-0 bg-primary/80 z-50 flex items-center justify-center p-edge-margin backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface-container-lowest rounded-xl shadow-lg p-6 border border-outline-variant/30 relative">
            <h3 className="font-headline-sm text-headline-sm font-bold text-primary mb-2">Submit Absence Excuse</h3>
            <p className="font-body-md text-body-md text-on-surface-variant mb-4">
              Provide a valid reason for your absence for admin review.
            </p>
            {message && <div className="p-2 mb-3 bg-secondary/10 text-secondary text-sm rounded text-center">{message}</div>}
            <form onSubmit={handleSubmitExcuse} className="flex flex-col gap-4">
              <textarea
                required
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="State your reason (e.g. Official Work Assignment, Health Issue...)"
                className="w-full bg-surface border border-outline-variant rounded-lg p-3 text-on-surface font-body-md"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowExcuseModal(false)}
                  className="flex-1 bg-surface-variant text-on-surface-variant font-label-md text-label-md py-3 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-primary text-on-primary font-label-md text-label-md py-3 rounded-lg font-bold"
                >
                  {submitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Correction Request Modal matching Stitch Screen 10 (correction_request/code.html) */}
      {showCorrectionModal && (
        <div className="fixed inset-0 bg-primary/80 z-50 flex items-center justify-center p-edge-margin backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface-container-lowest rounded-xl shadow-lg p-6 border border-outline-variant/30 relative">
            <h3 className="font-headline-sm text-headline-sm font-bold text-primary mb-2">Request Attendance Correction</h3>
            <p className="font-body-md text-body-md text-on-surface-variant mb-4">
              If your attendance was marked incorrectly due to network/GPS issues, submit a correction request.
            </p>
            {message && <div className="p-2 mb-3 bg-secondary/10 text-secondary text-sm rounded text-center">{message}</div>}
            <form onSubmit={handleSubmitCorrection} className="flex flex-col gap-4">
              <textarea
                required
                rows={4}
                value={correctionNote}
                onChange={(e) => setCorrectionNote(e.target.value)}
                placeholder="Explain the discrepancy (e.g. Present at 8:40 AM but scanner timed out...)"
                className="w-full bg-surface border border-outline-variant rounded-lg p-3 text-on-surface font-body-md"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowCorrectionModal(false)}
                  className="flex-1 bg-surface-variant text-on-surface-variant font-label-md text-label-md py-3 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-primary text-on-primary font-label-md text-label-md py-3 rounded-lg font-bold"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
