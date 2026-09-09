'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useChatUnread } from '../lib/chat';

export const BottomNav: React.FC = () => {
  const pathname = usePathname();
  const unread = useChatUnread();

  // The member bottom nav belongs only to the member app.
  if (!pathname.startsWith('/member')) {
    return null;
  }

  return (
    <nav className="bg-surface-container-lowest fixed bottom-0 w-full z-50 rounded-t-xl shadow-[0px_-2px_8px_rgba(0,0,0,0.05)] flex justify-around items-center px-2 pb-safe h-20 border-t border-outline-variant/10">
      {/* 1. Home */}
      <Link
        href="/member"
        className={`flex flex-col items-center justify-center font-semibold transition-transform duration-200 active:scale-90 w-16 gap-1 ${
          pathname === '/member' ? 'text-primary font-bold' : 'text-outline hover:text-primary'
        }`}
      >
        <span className="material-symbols-outlined" data-icon="home">home</span>
        <span className="font-label-sm text-[10px]">Home</span>
      </Link>

      {/* 2. Meetings */}
      <Link
        href="/member/meetings"
        className={`flex flex-col items-center justify-center transition-transform duration-200 active:scale-90 w-16 gap-1 ${
          pathname === '/member/meetings' || pathname === '/member/my-attendance' ? 'text-primary font-bold' : 'text-outline hover:text-primary'
        }`}
      >
        <span className="material-symbols-outlined" data-icon="calendar_today">calendar_today</span>
        <span className="font-label-sm text-[10px]">Meetings</span>
      </Link>

      {/* 3. Check-In (Scanner Floating Action Button) */}
      <Link
        href="/member/check-in"
        className="relative flex flex-col items-center justify-center w-16 transition-transform duration-200 active:scale-90 -mt-6"
      >
        <div className="w-14 h-14 bg-secondary rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(144,77,0,0.3)] border-4 border-surface-container-lowest">
          <span className="material-symbols-outlined text-on-secondary" data-icon="location_on">location_on</span>
        </div>
        <span className="font-label-sm text-[10px] mt-1 text-outline font-semibold">Check-In</span>
      </Link>

      {/* 4. Messages */}
      <Link
        href="/member/chat"
        className={`relative flex flex-col items-center justify-center transition-transform duration-200 active:scale-90 w-16 gap-1 ${
          pathname.startsWith('/member/chat') ? 'text-primary font-bold' : 'text-outline hover:text-primary'
        }`}
      >
        <span className="material-symbols-outlined" data-icon="forum">forum</span>
        <span className="font-label-sm text-[10px]">Messages</span>
        {unread > 0 && (
          <span className="absolute top-0 right-3 min-w-[16px] rounded-full bg-error px-1 text-[9px] font-bold leading-4 text-on-error">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Link>

      {/* 5. Profile */}
      <Link
        href="/member/profile"
        className={`flex flex-col items-center justify-center transition-transform duration-200 active:scale-90 w-16 gap-1 ${
          pathname === '/member/profile' ? 'text-primary font-bold' : 'text-outline hover:text-primary'
        }`}
      >
        <span className="material-symbols-outlined" data-icon="person">person</span>
        <span className="font-label-sm text-[10px]">Profile</span>
      </Link>
    </nav>
  );
};
