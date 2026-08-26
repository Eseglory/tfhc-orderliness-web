'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, QrCode, Award, User } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const pathname = usePathname();

  // Hide bottom nav on admin routes or login page
  if (pathname.startsWith('/admin') || pathname === '/login' || pathname === '/') {
    return null;
  }

  return (
    <nav className="bg-slate-900 border-t border-slate-800 fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl shadow-2xl flex justify-around items-center px-2 pb-safe h-20 max-w-md mx-auto sm:max-w-xl md:max-w-7xl">
      {/* 1. Home */}
      <Link
        href="/member"
        className={`flex flex-col items-center justify-center w-16 gap-1 transition-all ${
          pathname === '/member' ? 'text-amber-500 font-bold scale-105' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Home className="w-5 h-5" />
        <span className="text-[10px] font-medium tracking-tight">Home</span>
      </Link>

      {/* 2. Meetings */}
      <Link
        href="/member/my-attendance"
        className={`flex flex-col items-center justify-center w-16 gap-1 transition-all ${
          pathname === '/member/my-attendance' ? 'text-amber-500 font-bold scale-105' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Calendar className="w-5 h-5" />
        <span className="text-[10px] font-medium tracking-tight">Meetings</span>
      </Link>

      {/* 3. Floating Gold Check-In Scanner Button */}
      <Link
        href="/member/check-in"
        className="relative flex flex-col items-center justify-center w-16 transition-transform active:scale-95 -mt-6 group"
      >
        <div className="w-14 h-14 bg-gradient-to-tr from-amber-600 via-amber-500 to-amber-400 rounded-full flex items-center justify-center shadow-lg shadow-amber-500/30 border-4 border-slate-950 group-hover:scale-105 transition-transform">
          <QrCode className="w-6 h-6 text-slate-950 font-bold" />
        </div>
        <span className="text-[10px] font-semibold mt-1 text-amber-500">Check-In</span>
      </Link>

      {/* 4. Rankings */}
      <Link
        href="/member/leaderboard"
        className={`flex flex-col items-center justify-center w-16 gap-1 transition-all ${
          pathname === '/member/leaderboard' ? 'text-amber-500 font-bold scale-105' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Award className="w-5 h-5" />
        <span className="text-[10px] font-medium tracking-tight">Rankings</span>
      </Link>

      {/* 5. Profile */}
      <Link
        href="/member/profile"
        className={`flex flex-col items-center justify-center w-16 gap-1 transition-all ${
          pathname === '/member/profile' ? 'text-amber-500 font-bold scale-105' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <User className="w-5 h-5" />
        <span className="text-[10px] font-medium tracking-tight">Profile</span>
      </Link>
    </nav>
  );
};
