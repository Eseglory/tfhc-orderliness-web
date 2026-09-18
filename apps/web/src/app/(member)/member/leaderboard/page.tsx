'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchApi } from '../../../../lib/api';
import { LogoIcon } from '../../../../components/LogoIcon';

export default function MemberLeaderboardPage() {
  const router = useRouter();
  const [period, setPeriod] = useState('month');
  const [team, setTeam] = useState('');
  const [teams, setTeams] = useState<any[]>([]);
  useEffect(() => { fetchApi('/scoring/sub-teams').then(setTeams).catch(() => {}); }, []);
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const start = period === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : period === 'quarter' ? new Date(now.getFullYear(), Math.floor(now.getMonth()/3)*3, 1) : new Date(now.getFullYear(), 0, 1);
    const query = new URLSearchParams({startDate:start.toISOString(),endDate:now.toISOString(),...(team ? {subTeamId:team} : {})});
    fetchApi(`/scoring/leaderboard?${query}`)
      .then((data) => setLeaderboardData(data.map((item: any) => ({ ...item, memberName: `${item.firstName} ${item.lastName}`, attendancePercentage: item.attendanceRate, punctualityPercentage: item.punctualityRate, rankPosition: item.rank }))))
      .catch((err) => console.error(err));
    fetchApi('/auth/me')
      .then((me) => setMyMemberId(me?.memberId ?? null))
      .catch((err) => console.error(err));
  }, [period, team]);

  const myRow = myMemberId ? leaderboardData.find((r) => r.memberId === myMemberId) : undefined;

  const empty = { memberName: '—', attendancePercentage: 0, totalPoints: 0 };
  const top1 = leaderboardData[0] || empty;
  const top2 = leaderboardData[1] || empty;
  const top3 = leaderboardData[2] || empty;
  const rest = leaderboardData.slice(3);

  return (
    <div className="bg-background text-on-background min-h-screen pb-safe antialiased flex flex-col font-body-md">
      {/* TopAppBar */}
      <header className="bg-background flex justify-between items-center w-full px-edge-margin h-16 sticky top-0 z-40 border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center transition-all duration-200 active:scale-95 hover:opacity-80"
            aria-label="Go back"
          >
            <span className="material-symbols-outlined text-on-surface-variant">arrow_back</span>
          </button>
          <h1 className="font-headline-sm text-headline-sm font-bold text-primary">Leaderboard</h1>
        </div>
        <Link href="/member/notifications" className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:opacity-80 transition-all">
          <span className="material-symbols-outlined" data-icon="notifications">notifications</span>
        </Link>
      </header>

      <main className="flex-grow pb-36 max-w-3xl mx-auto w-full min-w-0 overflow-x-hidden">
        {/* Filters & Scope */}
        <section className="px-edge-margin py-stack-sm flex flex-col gap-stack-sm sticky top-0 bg-background/90 backdrop-blur-md z-30">
          <div className="flex gap-3">
            <label className="text-xs font-semibold text-on-surface-variant">Period<select value={period} onChange={e=>setPeriod(e.target.value)} className="block rounded p-2 text-sm bg-surface-container border border-outline-variant/30 text-on-surface mt-1"><option value="month">This Month</option><option value="quarter">This Quarter</option><option value="year">This Year</option></select></label>
            <label className="text-xs font-semibold text-on-surface-variant flex-1 min-w-0">Sub-team<select value={team} onChange={e=>setTeam(e.target.value)} className="block w-full max-w-[180px] sm:max-w-xs truncate rounded p-2 text-sm bg-surface-container border border-outline-variant/30 text-on-surface mt-1"><option value="">All Unit Teams</option>{teams.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label>
          </div>
        </section>

        {/* Podium (Top 3) matching Stitch Screen 11 */}
        <section className="px-edge-margin py-section-gap flex justify-center items-end gap-2 md:gap-4 h-64 mt-4 max-w-full overflow-hidden">
          {/* #2 Silver */}
          <div className="flex flex-col items-center">
            <div className="relative mb-2">
              <div className="w-16 h-16 rounded-full overflow-hidden border-4 border-[#C0C0C0] shadow-md z-10 relative bg-surface-container flex items-center justify-center">
                <LogoIcon alt="Second place" className="w-full h-full object-contain p-1" />
              </div>
              <div className="absolute -bottom-2 -right-2 bg-[#C0C0C0] text-white w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs border-2 border-surface z-20">2</div>
            </div>
            <p className="font-label-md text-label-md text-on-surface truncate w-20 text-center font-semibold">{top2.memberName || '—'}</p>
            <div className="bg-surface-container w-20 h-24 rounded-t-xl mt-2 flex flex-col items-center justify-start pt-3 border-t-2 border-[#C0C0C0] shadow-inner relative overflow-hidden">
              <span className="font-headline-sm text-headline-sm text-primary font-bold relative z-10">{top2.attendancePercentage}%</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant relative z-10">{top2.totalPoints} pts</span>
            </div>
          </div>

          {/* #1 Gold */}
          <div className="flex flex-col items-center z-10">
            <div className="relative mb-2">
              <span className="material-symbols-outlined text-[#FFD700] absolute -top-6 left-1/2 -translate-x-1/2 text-3xl drop-shadow-md z-20">crown</span>
              <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-[#FFD700] shadow-lg z-10 relative bg-surface-container flex items-center justify-center">
                <LogoIcon alt="First place" className="w-full h-full object-contain p-1" />
              </div>
              <div className="absolute -bottom-2 -right-2 bg-[#FFD700] text-tertiary-container w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm border-2 border-surface z-20">1</div>
            </div>
            <p className="font-label-md text-label-md text-on-surface font-bold truncate w-24 text-center mt-1">{top1.memberName || '—'}</p>
            <div className="bg-[#FFD700]/10 w-24 h-32 rounded-t-xl mt-2 flex flex-col items-center justify-start pt-4 border-t-4 border-[#FFD700] shadow-[0px_-4px_12px_rgba(255,215,0,0.15)] relative overflow-hidden">
              <span className="font-headline-md text-headline-md text-primary font-bold relative z-10">{top1.attendancePercentage}%</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant relative z-10 font-bold">{top1.totalPoints} pts</span>
            </div>
          </div>

          {/* #3 Bronze */}
          <div className="flex flex-col items-center">
            <div className="relative mb-2">
              <div className="w-16 h-16 rounded-full overflow-hidden border-4 border-[#CD7F32] shadow-md z-10 relative bg-surface-container flex items-center justify-center">
                <LogoIcon alt="Third place" className="w-full h-full object-contain p-1" />
              </div>
              <div className="absolute -bottom-2 -right-2 bg-[#CD7F32] text-white w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs border-2 border-surface z-20">3</div>
            </div>
            <p className="font-label-md text-label-md text-on-surface truncate w-20 text-center font-semibold">{top3.memberName || '—'}</p>
            <div className="bg-surface-container w-20 h-20 rounded-t-xl mt-2 flex flex-col items-center justify-start pt-2 border-t-2 border-[#CD7F32] shadow-inner relative overflow-hidden">
              <span className="font-headline-sm text-headline-sm text-primary font-bold relative z-10">{top3.attendancePercentage}%</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant relative z-10">{top3.totalPoints} pts</span>
            </div>
          </div>
        </section>

        {/* Ranked Table (4-20) */}
        <section className="px-edge-margin pb-stack-lg">
          <div className="bg-surface rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="flex items-center px-4 py-3 bg-surface-container-low border-b border-surface-variant text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider font-bold">
              <div className="w-8 text-center">Rk</div>
              <div className="flex-1 pl-2">Name</div>
              <div className="w-16 text-right">Att%</div>
              <div className="w-16 text-right hidden sm:block">Punct%</div>
              <div className="w-16 text-right">Pts</div>
            </div>

            <div className="flex flex-col">
              {rest.map((item, idx) => (
                <div key={idx} className="flex items-center px-4 py-3 border-b border-surface-variant last:border-0 hover:bg-surface-container-lowest transition-colors">
                  <div className="w-8 text-center font-label-md text-label-md text-on-surface-variant font-bold">
                    {item.rankPosition || idx + 4}
                  </div>
                  <div className="flex-1 pl-2 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-surface-dim overflow-hidden flex-shrink-0 flex items-center justify-center p-1 font-bold text-xs text-primary">
                      {item.memberName ? item.memberName.substring(0, 2).toUpperCase() : 'MT'}
                    </div>
                    <span className="font-body-md text-body-md text-on-surface truncate font-semibold">{item.memberName}</span>
                  </div>
                  <div className="w-16 text-right font-body-md text-body-md text-on-surface font-semibold">{item.attendancePercentage}%</div>
                  <div className="w-16 text-right font-body-md text-body-md text-on-surface-variant hidden sm:block">{item.punctualityPercentage ?? 0}%</div>
                  <div className="w-16 text-right font-label-md text-label-md text-primary font-bold">{item.totalPoints}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Cross-Navigation Links */}
        <section className="px-edge-margin pb-stack-lg grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/member/analytics"
            className="flex items-center justify-between p-3.5 rounded-xl border border-outline-variant/30 bg-surface-container-lowest hover:bg-surface-container-low transition-colors shadow-xs"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-lg">monitoring</span>
              </div>
              <div>
                <span className="font-label-md font-bold text-primary text-xs block">My Performance Analytics</span>
                <span className="text-[11px] text-on-surface-variant">View points breakdown &amp; dual ring chart</span>
              </div>
            </div>
            <span className="material-symbols-outlined text-outline-variant text-sm">chevron_right</span>
          </Link>

          <Link
            href="/member/rewards"
            className="flex items-center justify-between p-3.5 rounded-xl border border-outline-variant/30 bg-surface-container-lowest hover:bg-surface-container-low transition-colors shadow-xs"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-yellow-500/10 text-yellow-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-lg">workspace_premium</span>
              </div>
              <div>
                <span className="font-label-md font-bold text-primary text-xs block">Milestones &amp; Rewards</span>
                <span className="text-[11px] text-on-surface-variant">Check recognition eligibility criteria</span>
              </div>
            </div>
            <span className="material-symbols-outlined text-outline-variant text-sm">chevron_right</span>
          </Link>
        </section>
      </main>

      {/* Sticky bar: the signed-in member's own standing */}
      {myRow && (
        <div className="fixed bottom-20 inset-x-0 mx-auto w-full max-w-3xl px-edge-margin z-40 mb-2 pointer-events-none">
          <div className="bg-gradient-to-r from-secondary-container to-[#ffb347] text-on-secondary-container rounded-xl p-3 flex items-center justify-between pointer-events-auto border border-secondary-fixed shadow-[0px_4px_12px_rgba(254,147,44,0.3)]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center font-bold text-secondary-container text-lg shadow-sm border-2 border-surface shrink-0">
                {myRow.rank}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-headline-sm text-headline-sm font-bold leading-tight text-white truncate">You ({myRow.firstName} {myRow.lastName})</span>
                <div className="flex items-center gap-1 font-label-sm text-label-sm opacity-90 text-white">
                  <span>{myRow.attendancePercentage}% Att</span>
                  <span className="w-1 h-1 rounded-full bg-white"></span>
                  <span>{myRow.punctualityPercentage ?? 0}% Punct</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end text-white shrink-0 ml-2">
              <span className="font-headline-sm text-headline-sm font-bold">{myRow.totalPoints}</span>
              <span className="font-label-sm text-label-sm uppercase opacity-90">pts</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
