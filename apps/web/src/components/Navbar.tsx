'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AuthTransition } from './AuthTransition';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { removeAuthToken } from '../lib/api';
import { useAuth } from '../lib/auth';
import { LogoIcon } from './LogoIcon';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Show only if the user holds at least one of these permissions. Empty = always. */
  anyOf?: string[];
  children?: NavItem[];
}

const MEMBER_NAV: NavItem[] = [
  { href: '/member', label: 'Home', icon: 'home' },
  { href: '/member/check-in', label: 'Check In', icon: 'location_on' },
  { href: '/member/my-attendance', label: 'My Attendance', icon: 'calendar_today' },
  { href: '/member/leaderboard', label: 'Leaderboard', icon: 'emoji_events' },
  { href: '/member/dues', label: 'Dues', icon: 'payments' },
  { href: '/member/welfare', label: 'Welfare', icon: 'volunteer_activism' },
];

const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: 'dashboard' },
  {
    href: '/admin/calendar',
    label: 'Events',
    icon: 'event',
    anyOf: ['events.read', 'attendance.read'],
    children: [
      { href: '/admin/calendar', label: 'Calendar', icon: 'calendar_month' },
      { href: '/admin/meetings', label: 'All Events', icon: 'event_note' },
      { href: '/admin/meetings/dashboard', label: 'Event Dashboard', icon: 'insights' },
      { href: '/admin/services', label: 'Recurring Events', icon: 'repeat' },
      { href: '/admin/administration/lookups', label: 'Event Types', icon: 'category', anyOf: ['lookups.read'] },
    ],
  },
  { href: '/admin/members', label: 'Members', icon: 'group', anyOf: ['members.read'] },
  {
    href: '/admin/finance',
    label: 'Finance',
    icon: 'payments',
    anyOf: ['expenses.read', 'dues.read', 'payments.read'],
    children: [
      { href: '/admin/finance', label: 'Dashboard', icon: 'monitoring' },
      { href: '/admin/finance/dues', label: 'Monthly Dues', icon: 'calendar_month', anyOf: ['dues.read'] },
      { href: '/admin/finance/payments', label: 'Payments', icon: 'receipt_long', anyOf: ['payments.read'] },
      { href: '/admin/finance/expenses', label: 'Expenses', icon: 'shopping_cart', anyOf: ['expenses.read'] },
      { href: '/admin/finance/accounts', label: 'Payment Accounts', icon: 'account_balance', anyOf: ['payments.configure'] },
    ],
  },
  { href: '/admin/approvals', label: 'Approvals', icon: 'fact_check', anyOf: ['approvals.act', 'approvals.read'] },
  { href: '/admin/leaderboard', label: 'Leaderboard', icon: 'emoji_events', anyOf: ['scoring.read'] },
  { href: '/admin/follow-up', label: 'Follow-Up', icon: 'warning', anyOf: ['excuses.review', 'corrections.review', 'attendance.read'] },
  { href: '/admin/reports', label: 'Reports', icon: 'description', anyOf: ['reports.view'] },
  {
    href: '/admin/administration/team',
    label: 'Admin',
    icon: 'admin_panel_settings',
    anyOf: ['users.read', 'roles.read', 'settings.read', 'audit.read', 'lookups.read'],
    children: [
      { href: '/admin/administration/team', label: 'Admin Team', icon: 'group', anyOf: ['users.read'] },
      { href: '/admin/administration/roles', label: 'Roles & Permissions', icon: 'key', anyOf: ['roles.read'] },
      { href: '/admin/administration/lookups', label: 'Lookup Tables', icon: 'category', anyOf: ['lookups.read'] },
      { href: '/admin/settings', label: 'Settings', icon: 'settings', anyOf: ['settings.read', 'scoring.configure'] },
      { href: '/admin/audit', label: 'Audit Log', icon: 'history', anyOf: ['audit.read'] },
    ],
  },
];

export const Navbar: React.FC = () => {
  const [signingOut, setSigningOut] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { user, can, canAny } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);

  const isAdmin = pathname.startsWith('/admin');

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  useEffect(() => setOpenMenu(null), [pathname]);

  const handleLogout = () => {
    setSigningOut(true);
    removeAuthToken();
    requestAnimationFrame(() => requestAnimationFrame(() => router.replace('/login')));
  };

  // While RBAC info is still loading we optimistically show items; the backend
  // enforces access regardless, so a brief flash of an extra link is harmless.
  const visible = (item: NavItem) => {
    if (!item.anyOf || item.anyOf.length === 0) return true;
    if (!user) return true;
    return canAny(...item.anyOf);
  };

  const items = (isAdmin ? ADMIN_NAV : MEMBER_NAV).filter(visible);
  const active = (href: string) => (href === '/admin' || href === '/member' ? pathname === href : pathname.startsWith(href));
  const groupActive = (item: NavItem) =>
    active(item.href) || Boolean(item.children?.some((c) => active(c.href)));
  const activeGroup = items.find((i) => i.children && groupActive(i));
  // A child is "current" only if no sibling with a longer (more specific) href also matches.
  const childActive = (item: NavItem, child: NavItem) =>
    active(child.href) &&
    !item.children!.some((other) => other !== child && other.href.length > child.href.length && active(other.href));

  const linkClass = (isActive: boolean) =>
    `flex items-center gap-1.5 whitespace-nowrap px-2 py-2 rounded-lg font-semibold transition-colors xl:px-3 ${
      isActive
        ? 'bg-primary text-on-primary font-bold'
        : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'
    }`;

  return (
    <header className="bg-surface-container-lowest border-b border-outline-variant/20 sticky top-0 z-50">
      {signingOut && <AuthTransition action="out" />}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 h-16">
          <Link href={isAdmin ? '/admin' : '/member'} className="flex shrink-0 items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-surface-container border border-outline-variant/30 p-1 flex items-center justify-center shadow-sm">
              <LogoIcon alt="The Father's House Logo" className="w-full h-full object-contain" />
            </div>
            <div className="hidden sm:block leading-tight">
              <span className="block whitespace-nowrap text-sm font-bold tracking-tight text-primary">THE FATHER&apos;S HOUSE</span>
              <div className="flex items-center gap-1.5">
                <span className="whitespace-nowrap text-[11px] font-medium text-on-surface-variant">Orderliness</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container font-bold">
                  {isAdmin ? 'Admin' : 'Member'}
                </span>
              </div>
            </div>
          </Link>

          <nav ref={menuRef} className="hidden md:flex flex-1 items-center justify-center gap-0.5 text-label-md xl:gap-1">
            {items.map((item) =>
              item.children ? (
                <div key={item.href} className="relative">
                  <button
                    type="button"
                    aria-haspopup="true"
                    aria-expanded={openMenu === item.href}
                    onClick={() => setOpenMenu(openMenu === item.href ? null : item.href)}
                    className={linkClass(groupActive(item))}
                  >
                    <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                    <span className="hidden xl:inline">{item.label}</span>
                    <span className="material-symbols-outlined text-[16px]">expand_more</span>
                  </button>
                  {openMenu === item.href && (
                    <div className="absolute right-0 mt-1 w-56 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-1.5 shadow-lg">
                      {item.children.filter(visible).map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium ${
                            childActive(item, child)
                              ? 'bg-surface-container text-primary'
                              : 'text-on-surface hover:bg-surface-container'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[18px]">{child.icon}</span>
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Link key={item.href} href={item.href} className={linkClass(active(item.href))}>
                  <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                  <span className="hidden xl:inline">{item.label}</span>
                </Link>
              ),
            )}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            {(!user || user.role !== 'MEMBER' || isAdmin) && (
              <button
                onClick={() => router.push(isAdmin ? '/member' : '/admin')}
                className="whitespace-nowrap text-xs px-3 py-1.5 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors font-semibold border border-outline-variant/30"
              >
                {isAdmin ? 'Member app' : 'Admin portal'}
              </button>
            )}
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-outline hover:text-error hover:bg-error-container/30 transition-colors flex items-center justify-center"
              title="Logout"
            >
              <span className="material-symbols-outlined text-xl">logout</span>
            </button>
          </div>
        </div>

        {/* Secondary row: mobile sub-nav for the active dropdown section */}
        {isAdmin && activeGroup && (
          <div className="flex gap-1 overflow-x-auto border-t border-outline-variant/20 py-2 md:hidden">
            {activeGroup.children!.filter(visible).map((child) => (
              <Link
                key={child.href}
                href={child.href}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  childActive(activeGroup, child) ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                {child.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </header>
  );
};
