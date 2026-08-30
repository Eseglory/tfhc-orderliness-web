'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchApi, removeAuthToken } from '../../../../lib/api';

export default function MemberProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    fetchApi('/scoring/my-performance')
      .then((data) => setProfile(data))
      .catch((err) => console.error(err));
  }, []);

  const handleLogout = () => {
    removeAuthToken();
    router.push('/login');
  };

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col font-body-md pb-[90px]">
      {/* Top App Bar matching Stitch Screen 12 */}
      <header className="flex justify-between items-center w-full px-edge-margin h-16 bg-background flat no shadows docked full-width top-0 z-40 sticky border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-container-high border border-outline-variant flex-shrink-0">
            <img className="w-full h-full object-cover" src="/logo-icon.svg" alt="User profile" />
          </div>
          <h1 className="font-headline-sm text-headline-sm font-bold text-primary tracking-tight">Dashboard</h1>
        </div>
        <Link href="/member/notifications" className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors text-primary">
          <span className="material-symbols-outlined">notifications</span>
        </Link>
      </header>

      <main className="flex-1 px-edge-margin py-stack-md flex flex-col gap-section-gap w-full max-w-3xl mx-auto">
        {/* Profile Header Section matching Stitch Screen 12 */}
        <section className="flex flex-col items-center pt-stack-md pb-stack-lg gap-stack-md">
          <div className="relative group">
            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-surface-container-lowest shadow-[0px_2px_8px_rgba(0,0,0,0.05)] bg-surface-container p-1 flex items-center justify-center">
              <img className="w-full h-full object-contain" src="/logo-icon.svg" alt="Profile avatar" />
            </div>
            <button className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-on-primary rounded-full flex items-center justify-center shadow-md hover:bg-on-primary-fixed-variant transition-colors border-2 border-surface-container-lowest">
              <span className="material-symbols-outlined text-[16px]">edit</span>
            </button>
          </div>
          <div className="text-center flex flex-col gap-1">
            <h2 className="font-headline-sm text-headline-sm text-primary">
              {profile?.member ? `${profile.member.firstName} ${profile.member.lastName}` : 'Bro. Michael Adeleke'}
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant">
              {profile?.member?.subTeam?.name || 'Orderliness Protocol Sub-Team A'}
            </p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="font-label-sm text-label-sm bg-surface-container px-2 py-1 rounded text-on-surface-variant border border-outline-variant">
                ID: {profile?.member?.memberCode || 'TFHC-1042'}
              </span>
              <span className="font-label-sm text-label-sm bg-[#e6f4ea] text-[#137333] px-2 py-1 rounded font-semibold flex items-center gap-1 border border-[#ceead6]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#137333]"></span> Active
              </span>
            </div>
          </div>
        </section>

        {/* Personal Information Section */}
        <section className="bg-surface-container-lowest rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] overflow-hidden">
          <h3 className="font-label-md text-label-md text-on-surface-variant uppercase px-4 py-3 bg-surface-container-low border-b border-outline-variant/30">
            Personal Information
          </h3>
          <div className="flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-outline-variant/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-[18px]">phone</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Phone</span>
                  <span className="font-body-md text-body-md text-primary">
                    {profile?.member?.phoneNumber || '+234 801 234 5678'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 border-b border-outline-variant/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-[18px]">mail</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Email</span>
                  <span className="font-body-md text-body-md text-primary">
                    {profile?.member?.user?.email || 'm.adeleke@example.com'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-[18px]">event</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Joined Date</span>
                  <span className="font-body-md text-body-md text-primary">
                    {profile?.member?.dateJoined ? new Date(profile.member.dateJoined).toLocaleDateString() : 'October 12, 2021'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Settings Section */}
        <section className="bg-surface-container-lowest rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] overflow-hidden">
          <h3 className="font-label-md text-label-md text-on-surface-variant uppercase px-4 py-3 bg-surface-container-low border-b border-outline-variant/30">
            Settings &amp; Preferences
          </h3>
          <div className="flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-outline-variant/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-[18px]">notifications_active</span>
                </div>
                <span className="font-body-md text-body-md text-primary font-medium">Push Notifications</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked className="sr-only peer" />
                <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
            <div className="flex items-center justify-between p-4 border-b border-outline-variant/30 cursor-pointer hover:bg-surface-container-low transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-[18px]">location_on</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-body-md text-body-md text-primary font-medium">Location Status</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Always Allowed</span>
                </div>
              </div>
              <span className="material-symbols-outlined text-outline-variant">chevron_right</span>
            </div>
            <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface-container-low transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-[18px]">lock</span>
                </div>
                <span className="font-body-md text-body-md text-primary font-medium font-semibold">Change Password</span>
              </div>
              <span className="material-symbols-outlined text-outline-variant">chevron_right</span>
            </div>
          </div>
        </section>

        {/* Logout Action Section */}
        <section className="pb-stack-lg">
          <button
            onClick={handleLogout}
            className="w-full bg-surface-container-lowest border border-error/30 text-error font-body-md text-body-md font-medium py-3 rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] hover:bg-error-container/20 transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            Log Out
          </button>
        </section>
      </main>
    </div>
  );
}
