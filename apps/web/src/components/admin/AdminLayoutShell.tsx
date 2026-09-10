'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Calendar,
  Clock,
  BarChart3,
  Kanban,
  CheckSquare,
  AlertTriangle,
  Trophy,
  DollarSign,
  MessageSquare,
  Shield,
  Settings,
  History,
  Search,
  Plus,
  ChevronDown,
  Menu,
  X,
  LogOut,
  Building2,
  Bell,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Flame
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { logout } from '../../lib/api';
import { LogoIcon } from '../LogoIcon';
import { ProfilePhoto } from '../ProfilePhoto';
import { GlobalSearchModal } from './GlobalSearchModal';

interface NavGroup {
  title: string;
  items: {
    label: string;
    href: string;
    icon: React.ElementType;
    badge?: string | number;
    exact?: boolean;
    anyOf?: string[];
  }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'OVERVIEW',
    items: [
      { label: 'Dashboard', href: '/admin', icon: LayoutDashboard, exact: true },
    ],
  },
  {
    title: 'PEOPLE',
    items: [
      { label: 'Members Directory', href: '/admin/members', icon: Users, anyOf: ['members.read'] },
    ],
  },
  {
    title: 'ATTENDANCE & ANALYTICS',
    items: [
      { label: 'Overview & Trends', href: '/admin/reports', icon: BarChart3, anyOf: ['reports.view'] },
      { label: 'Events Calendar', href: '/admin/calendar', icon: Calendar, anyOf: ['events.read'] },
      { label: 'Live Meeting Session', href: '/admin/live-meeting', icon: Flame, anyOf: ['attendance.mark'] },
    ],
  },
  {
    title: 'CHURCH OPERATIONS',
    items: [
      { label: 'All Meetings & Services', href: '/admin/meetings', icon: Clock, anyOf: ['events.read'] },
      { label: 'Recurring Series', href: '/admin/services', icon: Calendar, anyOf: ['events.read'] },
      { label: 'Operations & Feature Board', href: '/admin/meetings/dashboard', icon: Kanban, anyOf: ['events.read'] },
    ],
  },
  {
    title: 'TRACKING & APPROVALS',
    items: [
      { label: 'Approvals & Requests', href: '/admin/approvals', icon: CheckSquare, anyOf: ['approvals.read', 'approvals.act'] },
      { label: 'Follow-Up & Flags', href: '/admin/follow-up', icon: AlertTriangle, anyOf: ['excuses.review'] },
      { label: 'Leaderboard', href: '/admin/leaderboard', icon: Trophy, anyOf: ['scoring.read'] },
    ],
  },
  {
    title: 'FINANCE & STEWARDSHIP',
    items: [
      { label: 'Finance Overview', href: '/admin/finance', icon: DollarSign, anyOf: ['dues.read', 'payments.read'] },
    ],
  },
  {
    title: 'COMMUNICATION',
    items: [
      { label: 'Team Messages', href: '/admin/chat', icon: MessageSquare },
    ],
  },
  {
    title: 'ADMINISTRATION',
    items: [
      { label: 'Admin Team', href: '/admin/administration/team', icon: Shield, anyOf: ['users.read'] },
      { label: 'Roles & Permissions', href: '/admin/administration/roles', icon: Shield, anyOf: ['roles.read'] },
      { label: 'Settings', href: '/admin/settings', icon: Settings, anyOf: ['settings.read'] },
      { label: 'Audit Log', href: '/admin/audit', icon: History, anyOf: ['audit.read'] },
    ],
  },
];

interface AdminLayoutShellProps {
  children: React.ReactNode;
}

export const AdminLayoutShell: React.FC<AdminLayoutShellProps> = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, canAny } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [selectedCampus, setSelectedCampus] = useState('Main Campus (TFHC)');

  const quickActionRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (quickActionRef.current && !quickActionRef.current.contains(e.target as Node)) {
        setQuickActionOpen(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Keyboard shortcut for Cmd+K / Ctrl+K search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchModalOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close mobile sidebar when route changes
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col antialiased">
      <GlobalSearchModal isOpen={searchModalOpen} onClose={() => setSearchModalOpen(false)} />

      {/* Top Navbar */}
      <header className="sticky top-0 z-30 h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between px-4 lg:px-6 shadow-sm">
        <div className="flex items-center gap-3">
          {/* Mobile menu toggle */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none"
            aria-label="Open sidebar menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo brand & campus selector */}
          <Link href="/admin" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold shadow-md shadow-slate-900/10 dark:shadow-none group-hover:scale-105 transition-transform">
              <LogoIcon alt="TFHC Orderliness logo" className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="hidden sm:block">
              <span className="font-extrabold text-sm tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
                TFHC Orderliness
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400">
                  ADMIN
                </span>
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">The Father&apos;s House Church</p>
            </div>
          </Link>

          {/* Campus Switcher Badge */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 ml-3 border border-slate-200/60 dark:border-slate-700/60">
            <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="font-medium truncate max-w-[140px]">{selectedCampus}</span>
          </div>
        </div>

        {/* Center/Right controls: Search bar trigger, Quick Action, Profile */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Omni Search Button */}
          <button
            onClick={() => setSearchModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-all border border-slate-200/70 dark:border-slate-700/70 text-xs sm:text-sm font-medium w-36 sm:w-64"
          >
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="truncate hidden sm:inline">Search congregants, reports...</span>
            <span className="truncate sm:hidden">Search...</span>
            <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 ml-auto">
              ⌘K
            </kbd>
          </button>

          {/* Quick Action Button Dropdown */}
          <div className="relative" ref={quickActionRef}>
            <button
              onClick={() => setQuickActionOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 text-xs sm:text-sm font-semibold transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Quick Action</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${quickActionOpen ? 'rotate-180' : ''}`} />
            </button>

            {quickActionOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-800 py-1.5 z-50 text-xs animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Operational Actions
                </div>
                <button
                  onClick={() => {
                    setQuickActionOpen(false);
                    router.push('/admin/live-meeting');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Flame className="w-4 h-4 text-amber-500" />
                  <span>Record Live Attendance</span>
                </button>
                <button
                  onClick={() => {
                    setQuickActionOpen(false);
                    router.push('/admin/members?action=create');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Users className="w-4 h-4 text-emerald-500" />
                  <span>Add New Member</span>
                </button>
                <button
                  onClick={() => {
                    setQuickActionOpen(false);
                    router.push('/admin/meetings?action=create');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Calendar className="w-4 h-4 text-indigo-500" />
                  <span>Create Meeting / Service</span>
                </button>
                <button
                  onClick={() => {
                    setQuickActionOpen(false);
                    router.push('/admin/reports');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <BarChart3 className="w-4 h-4 text-purple-500" />
                  <span>Export Report (Excel/CSV)</span>
                </button>
              </div>
            )}
          </div>

          {/* Admin Profile Dropdown */}
          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setProfileMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs ring-2 ring-indigo-500/20">
                {user?.firstName ? user.firstName[0] : 'A'}
              </div>
              <div className="hidden xl:block text-left">
                <p className="text-xs font-bold leading-tight text-slate-900 dark:text-white">
                  {user?.firstName ? `${user.firstName} ${user.lastName || ''}` : 'Administrator'}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 capitalize">
                  {user?.role?.toLowerCase() || 'Lead Admin'}
                </p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
            </button>

            {profileMenuOpen && (
              <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-800 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
                </div>
                <Link
                  href="/member"
                  onClick={() => setProfileMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Users className="w-4 h-4 text-slate-400" />
                  <span>Switch to Member Portal</span>
                </Link>
                <Link
                  href="/admin/settings"
                  onClick={() => setProfileMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Settings className="w-4 h-4 text-slate-400" />
                  <span>Settings & Policies</span>
                </Link>
                <div className="border-t border-slate-100 dark:border-slate-800 mt-1 pt-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-left font-medium"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Layout Container with Responsive Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Mobile Sidebar Backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 flex flex-col transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Mobile Sidebar Header */}
          <div className="lg:hidden flex items-center justify-between p-4 border-b border-slate-200/80 dark:border-slate-800">
            <span className="font-bold text-sm text-slate-900 dark:text-white">Operations Menu</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Groups */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-6 scrollbar-thin">
            {NAV_GROUPS.map((group) => {
              // Filter items by permission if defined
              const visibleItems = group.items.filter(
                (item) => !item.anyOf || canAny(...item.anyOf)
              );
              if (visibleItems.length === 0) return null;

              return (
                <div key={group.title}>
                  <p className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase mb-1.5">
                    {group.title}
                  </p>
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => {
                      const isActive = item.exact
                        ? pathname === item.href
                        : pathname.startsWith(item.href);
                      const Icon = item.icon;

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                            isActive
                              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icon
                              className={`w-4 h-4 shrink-0 ${
                                isActive ? 'text-white' : 'text-slate-400 dark:text-slate-500'
                              }`}
                            />
                            <span className="truncate">{item.label}</span>
                          </div>
                          {item.badge && (
                            <span
                              className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md ${
                                isActive
                                  ? 'bg-indigo-700 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

          {/* Sidebar Status Footer */}
          <div className="p-3 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/40">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-emerald-900 dark:text-emerald-300 truncate">
                  Cloud Sync Active
                </p>
                <p className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 truncate">
                  Production Node v3.4.1
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* Content Viewport */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </div>
    </div>
  );
};
