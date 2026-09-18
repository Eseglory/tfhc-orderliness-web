'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useChatUnread } from '../lib/chat';

export const BottomNav: React.FC = () => {
  const pathname = usePathname();
  const unread = useChatUnread();

  // The member bottom nav belongs only to the member portal.
  if (!pathname.startsWith('/member')) {
    return null;
  }

  const isHome = pathname === '/member';
  const isAttendance = pathname === '/member/my-attendance' || pathname.startsWith('/member/meetings') || pathname === '/member/calendar';
  const isCheckIn = pathname === '/member/check-in';
  const isChat = pathname.startsWith('/member/chat');
  const isProfile = pathname.startsWith('/member/profile');

  return (
    <nav aria-label="Member Navigation" className="fixed bottom-0 inset-x-0 sm:bottom-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:max-w-md w-full z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border-t sm:border border-slate-200/80 dark:border-slate-800 sm:rounded-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.06)] sm:shadow-[0_8px_32px_rgba(0,0,0,0.18)]">
      <div className="grid grid-cols-5 items-center justify-items-center h-16 sm:h-16 px-1">
        {/* 1. Home */}
        <Link
          href="/member"
          className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-all duration-200 active:scale-90 ${
            isHome ? 'text-[#f2320c] font-bold' : 'text-slate-500 hover:text-[#f2320c] dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <div className={`flex items-center justify-center w-10 h-7 rounded-full transition-colors ${
            isHome ? 'bg-red-50 text-[#f2320c] dark:bg-red-950/60 dark:text-red-400' : ''
          }`}>
            <span className="material-symbols-outlined text-[22px]" data-icon="home">home</span>
          </div>
          <span className="text-[10px] font-semibold tracking-tight leading-none">Home</span>
        </Link>

        {/* 2. Attendance */}
        <Link
          href="/member/my-attendance"
          className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-all duration-200 active:scale-90 ${
            isAttendance ? 'text-[#f2320c] font-bold' : 'text-slate-500 hover:text-[#f2320c] dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <div className={`flex items-center justify-center w-10 h-7 rounded-full transition-colors ${
            isAttendance ? 'bg-red-50 text-[#f2320c] dark:bg-red-950/60 dark:text-red-400' : ''
          }`}>
            <span className="material-symbols-outlined text-[22px]" data-icon="fact_check">fact_check</span>
          </div>
          <span className="text-[10px] font-semibold tracking-tight leading-none">Attendance</span>
        </Link>

        {/* 3. Check In (Floating Action Button) */}
        <Link
          href="/member/check-in"
          className="flex flex-col items-center justify-center w-full h-full relative -top-3 group transition-transform duration-200 active:scale-90"
        >
          <div className={`w-13 h-13 rounded-full flex items-center justify-center shadow-[0_4px_14px_rgba(242,50,12,0.35)] transition-transform group-hover:scale-105 border-4 border-white dark:border-slate-900 ${
            isCheckIn
              ? 'bg-[#f2320c] text-white ring-2 ring-[#f2320c] ring-offset-2'
              : 'bg-[#f2320c] text-white'
          }`}>
            <span className="material-symbols-outlined text-[24px]" data-icon="location_on">location_on</span>
          </div>
          <span className={`text-[10px] font-bold tracking-tight leading-none mt-1 ${
            isCheckIn ? 'text-[#f2320c]' : 'text-slate-600 dark:text-slate-400 group-hover:text-[#f2320c]'
          }`}>
            Check In
          </span>
        </Link>

        {/* 4. Notices / Chat */}
        <Link
          href="/member/chat"
          className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-all duration-200 active:scale-90 relative ${
            isChat ? 'text-[#f2320c] font-bold' : 'text-slate-500 hover:text-[#f2320c] dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <div className={`flex items-center justify-center w-10 h-7 rounded-full transition-colors relative ${
            isChat ? 'bg-red-50 text-[#f2320c] dark:bg-red-950/60 dark:text-red-400' : ''
          }`}>
            <span className="material-symbols-outlined text-[22px]" data-icon="forum">forum</span>
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-[#f2320c] px-1 text-[9px] font-bold leading-4 text-white flex items-center justify-center shadow-xs">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </div>
          <span className="text-[10px] font-semibold tracking-tight leading-none">Notices</span>
        </Link>

        {/* 5. Profile */}
        <Link
          href="/member/profile"
          className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-all duration-200 active:scale-90 ${
            isProfile ? 'text-[#f2320c] font-bold' : 'text-slate-500 hover:text-[#f2320c] dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <div className={`flex items-center justify-center w-10 h-7 rounded-full transition-colors ${
            isProfile ? 'bg-red-50 text-[#f2320c] dark:bg-red-950/60 dark:text-red-400' : ''
          }`}>
            <span className="material-symbols-outlined text-[22px]" data-icon="person">person</span>
          </div>
          <span className="text-[10px] font-semibold tracking-tight leading-none">Profile</span>
        </Link>
      </div>
    </nav>
  );
};
