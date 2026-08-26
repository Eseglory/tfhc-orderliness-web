'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { removeAuthToken } from '../lib/api';
import { Calendar, CheckSquare, Award, Users, ShieldAlert, FileText, LogOut, LayoutDashboard } from 'lucide-react';

export const Navbar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();

  const isAdmin = pathname.startsWith('/admin');

  const handleLogout = () => {
    removeAuthToken();
    router.push('/login');
  };

  return (
    <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
              TF
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-white">TFHC Orderliness</span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-medium">
                {isAdmin ? 'Admin Portal' : 'Member App'}
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center space-x-1">
            {isAdmin ? (
              <>
                <Link
                  href="/admin"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/admin' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4" /> Dashboard
                </Link>
                <Link
                  href="/admin/meetings"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/admin/meetings' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Calendar className="w-4 h-4" /> Meetings
                </Link>
                <Link
                  href="/admin/members"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/admin/members' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Users className="w-4 h-4" /> Members
                </Link>
                <Link
                  href="/admin/leaderboard"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/admin/leaderboard' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Award className="w-4 h-4" /> Leaderboard
                </Link>
                <Link
                  href="/admin/follow-up"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/admin/follow-up' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <ShieldAlert className="w-4 h-4" /> Follow-Up
                </Link>
                <Link
                  href="/admin/reports"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/admin/reports' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <FileText className="w-4 h-4" /> Reports
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/member"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/member' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4" /> Home
                </Link>
                <Link
                  href="/member/check-in"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/member/check-in' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <CheckSquare className="w-4 h-4" /> Check In
                </Link>
                <Link
                  href="/member/my-attendance"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/member/my-attendance' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Calendar className="w-4 h-4" /> My Attendance
                </Link>
                <Link
                  href="/member/leaderboard"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/member/leaderboard' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Award className="w-4 h-4" /> Leaderboard
                </Link>
              </>
            )}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push(isAdmin ? '/member' : '/admin')}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
            >
              Switch to {isAdmin ? 'Member App' : 'Admin Portal'}
            </button>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
