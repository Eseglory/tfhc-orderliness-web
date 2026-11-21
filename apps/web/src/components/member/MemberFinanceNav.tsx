'use client';

import React from 'react';
import Link from 'next/link';
import { Calendar, Sparkles, History } from 'lucide-react';

interface MemberFinanceNavProps {
  active: 'dues' | 'contributions' | 'payments';
  unpaidDuesCount?: number;
  activeCampaignsCount?: number;
  pendingPaymentsCount?: number;
}

export function MemberFinanceNav({
  active,
  unpaidDuesCount = 0,
  activeCampaignsCount = 0,
  pendingPaymentsCount = 0,
}: MemberFinanceNavProps) {
  const tabs = [
    {
      id: 'dues',
      label: 'Monthly Dues',
      href: '/member/dues',
      icon: Calendar,
      badge: unpaidDuesCount > 0 ? `${unpaidDuesCount} Unpaid` : undefined,
      badgeTone: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
    },
    {
      id: 'contributions',
      label: 'Other Contributions',
      href: '/member/contributions',
      icon: Sparkles,
      badge: activeCampaignsCount > 0 ? `${activeCampaignsCount} Active` : undefined,
      badgeTone: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
    },
    {
      id: 'payments',
      label: 'Payment History',
      href: '/member/payments',
      icon: History,
      badge: pendingPaymentsCount > 0 ? `${pendingPaymentsCount} Pending` : undefined,
      badgeTone: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    },
  ];

  return (
    <div className="w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-16 z-30 shadow-xs">
      <div className="max-w-3xl mx-auto px-4">
        <nav aria-label="Finance navigation" className="flex space-x-1 sm:space-x-2 overflow-x-auto no-scrollbar py-2">
          {tabs.map((tab) => {
            const isActive = active === tab.id;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-200 ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-white/20 text-white' : tab.badgeTone
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
