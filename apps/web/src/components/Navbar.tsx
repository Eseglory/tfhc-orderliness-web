'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { removeAuthToken } from '../lib/api';
import { LogoIcon } from './LogoIcon';

export const Navbar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();

  const isAdmin = pathname.startsWith('/admin');

  const handleLogout = () => {
    removeAuthToken();
    router.push('/login');
  };

  return (
    <header className="bg-surface-container-lowest border-b border-outline-variant/20 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <Link href={isAdmin ? '/admin' : '/member'} className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-surface-container border border-outline-variant/30 p-1 flex items-center justify-center shadow-sm">
                <LogoIcon alt="The Father's House Logo" className="w-full h-full object-contain" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold tracking-tight text-primary">THE FATHER&apos;S HOUSE</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-on-surface-variant">Orderliness Tracker</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container font-bold">
                    {isAdmin ? 'Admin Portal' : 'Member App'}
                  </span>
                </div>
              </div>
            </Link>
          </div>

          <nav className="hidden md:flex items-center space-x-1 font-label-md text-label-md">
            {isAdmin ? (
              <>
                <Link
                  href="/admin"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold transition-colors ${
                    pathname === '/admin' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">dashboard</span> <span className="hidden lg:inline">Dashboard</span>
                </Link>
                <Link
                  href="/admin/meetings"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold transition-colors ${
                    pathname === '/admin/meetings' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">calendar_today</span> <span className="hidden lg:inline">Meetings</span>
                </Link>
                <Link
                  href="/admin/members"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold transition-colors ${
                    pathname === '/admin/members' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">group</span> <span className="hidden lg:inline">Members</span>
                </Link>
                <Link
                  href="/admin/leaderboard"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold transition-colors ${
                    pathname === '/admin/leaderboard' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">emoji_events</span> <span className="hidden lg:inline">Leaderboard</span>
                </Link>
                <Link
                  href="/admin/follow-up"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold transition-colors ${
                    pathname === '/admin/follow-up' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">warning</span> <span className="hidden lg:inline">Follow-Up</span>
                </Link>
                <Link
                  href="/admin/reports"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold transition-colors ${
                    pathname === '/admin/reports' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">description</span> <span className="hidden lg:inline">Reports</span>
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/member"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold transition-colors ${
                    pathname === '/member' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">home</span> <span className="hidden lg:inline">Home</span>
                </Link>
                <Link
                  href="/member/check-in"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold transition-colors ${
                    pathname === '/member/check-in' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span> <span className="hidden lg:inline">Check In</span>
                </Link>
                <Link
                  href="/member/my-attendance"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold transition-colors ${
                    pathname === '/member/my-attendance' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">calendar_today</span> <span className="hidden lg:inline">My Attendance</span>
                </Link>
                <Link
                  href="/member/leaderboard"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold transition-colors ${
                    pathname === '/member/leaderboard' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">emoji_events</span> <span className="hidden lg:inline">Leaderboard</span>
                </Link>
              </>
            )}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push(isAdmin ? '/member' : '/admin')}
              className="text-xs px-3 py-1.5 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors font-semibold border border-outline-variant/30"
            >
              <span className="hidden lg:inline">Switch to {isAdmin ? 'Member App' : 'Admin Portal'}</span>
              <span className="lg:hidden">{isAdmin ? 'Member App' : 'Admin'}</span>
            </button>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-outline hover:text-error hover:bg-error-container/30 transition-colors flex items-center justify-center"
              title="Logout"
            >
              <span className="material-symbols-outlined text-xl">logout</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
