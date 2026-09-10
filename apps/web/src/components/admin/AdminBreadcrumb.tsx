'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';

interface RouteHierarchy {
  path: string;
  label: string;
  parent?: {
    label: string;
    href?: string;
  };
}

const ROUTE_MAP: Record<string, RouteHierarchy> = {
  '/admin': { path: '/admin', label: 'Dashboard Overview' },
  '/admin/members': { path: '/admin/members', label: 'Members Directory', parent: { label: 'People' } },
  '/admin/leaderboard': { path: '/admin/leaderboard', label: 'Leaderboard', parent: { label: 'People' } },
  '/admin/calendar': { path: '/admin/calendar', label: 'Events Calendar', parent: { label: 'Events & Gatherings', href: '/admin/meetings' } },
  '/admin/meetings': { path: '/admin/meetings', label: 'All Meetings & Services', parent: { label: 'Events & Gatherings' } },
  '/admin/services': { path: '/admin/services', label: 'Recurring Series', parent: { label: 'Events & Gatherings', href: '/admin/meetings' } },
  '/admin/meetings/dashboard': { path: '/admin/meetings/dashboard', label: 'Operations Board', parent: { label: 'Events & Gatherings', href: '/admin/meetings' } },
  '/admin/live-meeting': { path: '/admin/live-meeting', label: 'Live Roster Session', parent: { label: 'Events & Gatherings', href: '/admin/meetings' } },
  '/admin/reports': { path: '/admin/reports', label: 'Attendance Analytics & Trends', parent: { label: 'Attendance' } },
  '/admin/approvals': { path: '/admin/approvals', label: 'Approvals Center', parent: { label: 'Tracking & Approvals' } },
  '/admin/absence-requests': { path: '/admin/absence-requests', label: 'Absence Requests', parent: { label: 'Tracking & Approvals', href: '/admin/approvals' } },
  '/admin/follow-up': { path: '/admin/follow-up', label: 'Follow-Up & Flags', parent: { label: 'Tracking & Approvals' } },
  '/admin/finance': { path: '/admin/finance', label: 'Finance Overview', parent: { label: 'Finance' } },
  '/admin/finance/dues': { path: '/admin/finance/dues', label: 'Monthly Dues', parent: { label: 'Finance', href: '/admin/finance' } },
  '/admin/finance/payments': { path: '/admin/finance/payments', label: 'Payments & Receipts', parent: { label: 'Finance', href: '/admin/finance' } },
  '/admin/finance/expenses': { path: '/admin/finance/expenses', label: 'Expenses & Budget', parent: { label: 'Finance', href: '/admin/finance' } },
  '/admin/finance/accounts': { path: '/admin/finance/accounts', label: 'Payment Accounts', parent: { label: 'Finance', href: '/admin/finance' } },
  '/admin/chat': { path: '/admin/chat', label: 'Team Messages & Chat', parent: { label: 'Communication' } },
  '/admin/administration/team': { path: '/admin/administration/team', label: 'Admin Team', parent: { label: 'Administration' } },
  '/admin/administration/roles': { path: '/admin/administration/roles', label: 'Roles & Permissions', parent: { label: 'Administration' } },
  '/admin/administration/lookups': { path: '/admin/administration/lookups', label: 'Lookup Tables', parent: { label: 'Administration' } },
  '/admin/settings': { path: '/admin/settings', label: 'System Settings', parent: { label: 'Administration' } },
  '/admin/audit': { path: '/admin/audit', label: 'Audit Logs', parent: { label: 'Administration' } },
};

export const AdminBreadcrumb: React.FC = () => {
  const pathname = usePathname();

  // Find matching route mapping or best prefix match
  const matched = ROUTE_MAP[pathname] || Object.values(ROUTE_MAP).find((r) => pathname.startsWith(r.path) && r.path !== '/admin');

  if (!matched || pathname === '/admin') return null;

  return (
    <nav className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 py-1 overflow-x-auto whitespace-nowrap scrollbar-none" aria-label="Breadcrumb">
      <Link
        href="/admin"
        className="flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors font-medium"
      >
        <Home className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Admin</span>
      </Link>

      <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />

      {matched.parent && (
        <>
          {matched.parent.href ? (
            <Link
              href={matched.parent.href}
              className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors font-medium"
            >
              {matched.parent.label}
            </Link>
          ) : (
            <span className="font-medium text-slate-600 dark:text-slate-400">{matched.parent.label}</span>
          )}
          <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
        </>
      )}

      <span className="font-bold text-slate-900 dark:text-white truncate max-w-[200px] sm:max-w-none">
        {matched.label}
      </span>
    </nav>
  );
};
