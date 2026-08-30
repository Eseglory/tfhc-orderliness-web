'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchApi } from '../../../../lib/api';

export default function MemberLeaderboardPage() {
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);

  useEffect(() => {
    fetchApi('/scoring/leaderboard')
      .then((data) => setLeaderboardData(data))
      .catch((err) => console.error(err));
  }, []);

  const top1 = leaderboardData[0] || { memberName: 'David K.', attendancePercentage: 99, totalPoints: 520 };
  const top2 = leaderboardData[1] || { memberName: 'Sarah M.', attendancePercentage: 96, totalPoints: 450 };
  const top3 = leaderboardData[2] || { memberName: 'Elena R.', attendancePercentage: 94, totalPoints: 410 };
  const rest = leaderboardData.length > 3 ? leaderboardData.slice(3) : [
    { rankPosition: 4, memberName: 'Marcus T.', attendancePercentage: 92.5, punctualityPercentage: 88.0, totalPoints: 380 },
    { rankPosition: 5, memberName: 'Jessica W.', attendancePercentage: 92.0, punctualityPercentage: 85.5, totalPoints: 310 },
    { rankPosition: 7, memberName: 'Alex T.', attendancePercentage: 90.1, punctualityPercentage: 80.0, totalPoints: 195 },
    { rankPosition: 8, memberName: 'Brian J.', attendancePercentage: 88.5, punctualityPercentage: 78.5, totalPoints: 180 },
  ];

  return (
    <div className="bg-background text-on-background min-h-screen pb-safe antialiased flex flex-col font-body-md">
      {/* TopAppBar matching Stitch Screen 11 */}
      <header className="bg-background flex justify-between items-center w-full px-edge-margin h-16 docked full-width top-0 z-40 relative border-b border-outline-variant/10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-variant flex items-center justify-center p-1">
            <img className="w-full h-full object-contain" src="/logo-icon.svg" alt="Logo" />
          </div>
          <h1 className="font-headline-sm text-headline-sm font-bold text-primary">Dashboard</h1>
        </div>
        <Link href="/member/notifications" className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:opacity-80 transition-all">
          <span className="material-symbols-outlined" data-icon="notifications">notifications</span>
        </Link>
      </header>

      <main className="flex-grow pb-36 max-w-3xl mx-auto w-full">
        {/* Filters & Scope */}
        <section className="px-edge-margin py-stack-sm flex flex-col gap-stack-sm sticky top-0 bg-background/90 backdrop-blur-md z-30">
          <div className="flex justify-between items-center gap-gutter">
            <div className="flex bg-surface-container-low rounded-lg p-1 flex-1">
              <button className="flex-1 py-1.5 px-3 rounded text-on-surface bg-surface shadow-[0px_2px_8px_rgba(0,0,0,0.05)] font-label-md text-label-md font-bold">This Month</button>
              <button className="flex-1 py-1.5 px-3 rounded text-on-surface-variant font-label-md text-label-md hover:text-on-surface">Q3 2026</button>
            </div>
            <button className="flex items-center gap-1 bg-surface-container-low text-on-surface py-2 px-3 rounded-lg font-label-md text-label-md font-semibold">
              All Unit Teams
              <span className="material-symbols-outlined text-lg" data-icon="arrow_drop_down">arrow_drop_down</span>
            </button>
          </div>
        </section>

        {/* Podium (Top 3) matching Stitch Screen 11 */}
        <section className="px-edge-margin py-section-gap flex justify-center items-end gap-2 md:gap-4 h-64 mt-4">
          {/* #2 Silver */}
          <div className="flex flex-col items-center">
            <div className="relative mb-2">
              <div className="w-16 h-16 rounded-full overflow-hidden border-4 border-[#C0C0C0] shadow-md z-10 relative bg-surface-container flex items-center justify-center">
                <img className="w-full h-full object-contain p-1" src="/logo-icon.svg" alt="Second place" />
              </div>
              <div className="absolute -bottom-2 -right-2 bg-[#C0C0C0] text-white w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs border-2 border-surface z-20">2</div>
            </div>
            <p className="font-label-md text-label-md text-on-surface truncate w-20 text-center font-semibold">{top2.memberName || 'Sarah M.'}</p>
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
                <img className="w-full h-full object-contain p-1" src="/logo-icon.svg" alt="First place" />
              </div>
              <div className="absolute -bottom-2 -right-2 bg-[#FFD700] text-tertiary-container w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm border-2 border-surface z-20">1</div>
            </div>
            <p className="font-label-md text-label-md text-on-surface font-bold truncate w-24 text-center mt-1">{top1.memberName || 'David K.'}</p>
            <div className="bg-[#FFD700]/10 w-24 h-32 rounded-t-xl mt-2 flex flex-col items-center justify-start pt-4 border-t-4 border-[#FFD700] shadow-[0px_-4px_12px_rgba(255,215,0,0.15)] relative overflow-hidden">
              <span className="font-headline-md text-headline-md text-primary font-bold relative z-10">{top1.attendancePercentage}%</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant relative z-10 font-bold">{top1.totalPoints} pts</span>
            </div>
          </div>

          {/* #3 Bronze */}
          <div className="flex flex-col items-center">
            <div className="relative mb-2">
              <div className="w-16 h-16 rounded-full overflow-hidden border-4 border-[#CD7F32] shadow-md z-10 relative bg-surface-container flex items-center justify-center">
                <img className="w-full h-full object-contain p-1" src="/logo-icon.svg" alt="Third place" />
              </div>
              <div className="absolute -bottom-2 -right-2 bg-[#CD7F32] text-white w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs border-2 border-surface z-20">3</div>
            </div>
            <p className="font-label-md text-label-md text-on-surface truncate w-20 text-center font-semibold">{top3.memberName || 'Elena R.'}</p>
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
                  <div className="w-16 text-right font-body-md text-body-md text-on-surface-variant hidden sm:block">{item.punctualityPercentage || 85.0}%</div>
                  <div className="w-16 text-right font-label-md text-label-md text-primary font-bold">{item.totalPoints}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Sticky User Bar matching Stitch Screen 11 */}
      <div className="fixed bottom-20 w-full max-w-3xl left-1/2 -translate-x-1/2 px-edge-margin z-40 mb-2 pointer-events-none">
        <div className="bg-gradient-to-r from-secondary-container to-[#ffb347] text-on-secondary-container rounded-xl p-3 flex items-center justify-between pointer-events-auto border border-secondary-fixed shadow-[0px_4px_12px_rgba(254,147,44,0.3)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center font-bold text-secondary-container text-lg shadow-sm border-2 border-surface">
              6
            </div>
            <div className="flex flex-col">
              <span className="font-headline-sm text-headline-sm font-bold leading-tight text-white">You (Bro. Michael)</span>
              <div className="flex items-center gap-1 font-label-sm text-label-sm opacity-90 text-white">
                <span>91.7% Att</span>
                <span className="w-1 h-1 rounded-full bg-white"></span>
                <span>81.8% Punct</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end text-white">
            <span className="font-headline-sm text-headline-sm font-bold">210</span>
            <span className="font-label-sm text-label-sm uppercase opacity-90">pts</span>
          </div>
        </div>
      </div>
    </div>
  );
}
