'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchApi } from '../../../../lib/api';
import { LogoIcon } from '../../../../components/LogoIcon';

export default function MemberMeetingsPage() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [filter, setFilter] = useState<'Upcoming' | 'Past' | 'Mandatory'>('Upcoming');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    fetchApi('/meetings')
      .then((data) => setMeetings(data))
      .catch((err) => console.error(err));
  }, []);

  const filteredMeetings = meetings.filter((m) => {
    if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedCategory !== 'All' && m.category?.name !== selectedCategory) return false;
    return true;
  });

  return (
    <div className="bg-background text-on-background font-body-md min-h-screen pb-safe">
      {/* TopAppBar matching Stitch Screen 6 */}
      <header className="bg-background flex justify-between items-center w-full px-edge-margin h-16 sticky top-0 z-40 border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-container flex-shrink-0 p-1">
            <LogoIcon alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="font-headline-sm text-headline-sm font-bold text-primary">Meetings</h1>
        </div>
        <Link href="/member/notifications" className="text-on-surface-variant hover:opacity-80 transition-all duration-200">
          <span className="material-symbols-outlined">notifications</span>
        </Link>
      </header>

      <main className="px-edge-margin pb-32 max-w-3xl mx-auto">
        {/* Segmented Controls matching Stitch Screen 6 */}
        <div className="bg-surface-container-low p-1 rounded-lg flex mt-stack-md">
          {(['Upcoming', 'Past', 'Mandatory'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`flex-1 rounded font-label-md text-label-md py-2 text-center transition-all ${
                filter === tab
                  ? 'bg-surface-container-lowest text-primary shadow-[0px_2px_8px_rgba(0,0,0,0.05)] font-bold'
                  : 'text-on-surface-variant hover:text-primary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search & Filter matching Stitch Screen 6 */}
        <div className="mt-stack-md space-y-stack-sm">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">search</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search meetings..."
              className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg pl-10 pr-4 py-2 font-body-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-outline-variant text-on-surface"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {['All', 'Unit Meetings', 'Services', 'Rehearsals', 'Trainings'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full font-label-sm text-label-sm transition-colors ${
                  selectedCategory === cat
                    ? 'bg-primary text-on-primary font-bold'
                    : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant hover:border-primary'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Meeting List matching Stitch Screen 6 */}
        <div className="mt-section-gap space-y-gutter">
          {filteredMeetings.length > 0 ? (
            filteredMeetings.map((m) => {
              const d = new Date(m.meetingDate);
              const monthStr = d.toLocaleString('default', { month: 'short' });
              const dayStr = d.getDate();

              return (
                <Link key={m.id} href={`/member/meetings/${m.id}`}>
                  <div className="bg-surface-container-lowest p-stack-md rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-surface-container-low flex gap-stack-md hover:border-primary transition-colors cursor-pointer mb-3">
                    <div className="flex flex-col items-center justify-center bg-surface-container-low rounded-lg w-16 h-16 shrink-0">
                      <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">{monthStr}</span>
                      <span className="font-headline-md text-headline-md text-primary font-bold">{dayStr}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap justify-between items-start gap-2">
                        <h3 className="font-headline-sm text-headline-sm text-primary font-bold break-words min-w-0">{m.title}</h3>
                        <span className="shrink-0 whitespace-nowrap bg-surface-container text-on-primary-container px-2 py-0.5 rounded font-label-sm text-label-sm">
                          {m.pointWeight}x Weight
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center gap-2 text-on-surface-variant font-body-md text-body-md">
                          <span className="material-symbols-outlined text-[16px]">schedule</span>
                          <span>
                            Expected: {new Date(m.expectedArrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} | Starts: {new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-on-surface-variant font-body-md text-body-md">
                          <span className="material-symbols-outlined text-[16px]">location_on</span>
                          <span>{m.locationName}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })
          ) : (
            <>
              {/* Fallback Cards matching Stitch export */}
              <div className="bg-surface-container-lowest p-stack-md rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-surface-container-low flex gap-stack-md">
                <div className="flex flex-col items-center justify-center bg-surface-container-low rounded-lg w-16 h-16 shrink-0">
                  <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Aug</span>
                  <span className="font-headline-md text-headline-md text-primary font-bold">15</span>
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <h3 className="font-headline-sm text-headline-sm text-primary font-bold">Sunday Service</h3>
                    <span className="bg-surface-container text-on-primary-container px-2 py-0.5 rounded font-label-sm text-label-sm">
                      Special Programme 2.0x
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2 text-on-surface-variant font-body-md text-body-md">
                      <span className="material-symbols-outlined text-[16px]">schedule</span>
                      <span>Expected: 8:45 AM | Starts: 9:00 AM</span>
                    </div>
                    <div className="flex items-center gap-2 text-on-surface-variant font-body-md text-body-md">
                      <span className="material-symbols-outlined text-[16px]">location_on</span>
                      <span>Main Auditorium</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-surface-container-lowest p-stack-md rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-surface-container-low flex gap-stack-md opacity-70">
                <div className="flex flex-col items-center justify-center bg-surface-container-low rounded-lg w-16 h-16 shrink-0">
                  <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Aug</span>
                  <span className="font-headline-md text-headline-md text-primary font-bold">12</span>
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <h3 className="font-headline-sm text-headline-sm text-primary font-bold">Midweek Training</h3>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2 text-on-surface-variant font-body-md text-body-md">
                      <span className="material-symbols-outlined text-[16px]">schedule</span>
                      <span>Expected: 6:15 PM | Starts: 6:30 PM</span>
                    </div>
                    <div className="flex items-center gap-2 text-on-surface-variant font-body-md text-body-md">
                      <span className="material-symbols-outlined text-[16px]">location_on</span>
                      <span>Hall B</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
