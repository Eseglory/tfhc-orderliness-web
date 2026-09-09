'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchApi } from '../../../../lib/api';
export default function RewardsPage() {
  const [performance, setPerformance] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(()=>{fetchApi('/scoring/my-performance').then(setPerformance).catch(e=>setError(e.message));},[]);
  return <main className="max-w-3xl mx-auto p-5 pb-28 space-y-5">
    <Link href="/member">← Home</Link><h1 className="text-2xl font-bold">Your Milestones</h1>
    {error ? <p role="alert">{error}</p> : !performance ? <p role="status">Loading milestones…</p> : <>
      <section className="grid grid-cols-2 gap-4">
        {[['Total Points',performance.totalPoints],['Meetings Attended',performance.attendedCount],['Attendance Streak',performance.currentAttendanceStreak],['On-Time Streak',performance.currentOnTimeStreak]].map(([label,value])=><article key={label} className="p-5 bg-surface-container rounded-xl"><h2>{label}</h2><p className="text-3xl font-bold">{value}</p></article>)}
      </section>
      <p>Milestones reflect your recorded attendance.</p>
      <section className="rounded-xl p-5 bg-surface-container"><h2 className="font-bold">Recognition eligibility</h2><p>{performance.recognition?.eligible ? 'You meet the current recognition criteria.' : 'Keep attending to reach the recognition criteria.'}</p><p>Requires {performance.recognition?.minimumMeetings} expected meetings, {performance.recognition?.attendanceThreshold}% attendance and {performance.recognition?.punctualityThreshold}% punctuality.</p></section><Link href="/member/leaderboard">View the leaderboard</Link>
    </>}
  </main>;
}
