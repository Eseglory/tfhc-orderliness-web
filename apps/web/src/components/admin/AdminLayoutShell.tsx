'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  ChevronRight,
  Menu,
  X,
  LogOut,
  Building2,
  Bell,
  Sparkles,
  Flame,
  FileText,
  Sliders,
  FolderTree,
  PanelLeftClose,
  PanelLeftOpen,
  Layers,
  HeartHandshake,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { logout } from '../../lib/api';
import { LogoIcon } from '../LogoIcon';
import { GlobalSearchModal } from './GlobalSearchModal';
import { AdminBreadcrumb } from './AdminBreadcrumb';
import { ThemeSwitcher } from '../ThemeSwitcher';

interface NavChild {
  href: string;
  label: string;
  icon?: React.ElementType;
  badge?: string | number;
  anyOf?: string[];
  exact?: boolean;
}

interface NavParent {
  key: string;
  label: string;
  icon: React.ElementType;
  href?: string; // If direct link without children (e.g. Dashboard)
  exact?: boolean;
  anyOf?: string[];
  badge?: string | number;
  children?: NavChild[];
}

const NAVIGATION_TREE: NavParent[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    href: '/admin',
    exact: true,
  },
  {
    key: 'people',
    label: 'People & Congregation',
    icon: Users,
    anyOf: ['members.read'],
    children: [
      { href: '/admin/members', label: 'Members Directory', icon: Users, anyOf: ['members.read'] },
      { href: '/admin/leaderboard', label: 'Leaderboard & Points', icon: Trophy, anyOf: ['scoring.read'] },
    ],
  },
  {
    key: 'events',
    label: 'Events & Gatherings',
    icon: Calendar,
    anyOf: ['events.read', 'attendance.read', 'attendance.mark'],
    children: [
      { href: '/admin/calendar', label: 'Activities & Master Calendar', icon: Calendar, anyOf: ['events.read'] },
      { href: '/admin/events', label: 'Events Management & Ticketing', icon: Sparkles, anyOf: ['events.read'] },
      { href: '/admin/appointments', label: 'Appointments & Pastoral Care', icon: HeartHandshake, anyOf: ['events.read'] },
      { href: '/admin/meetings', label: 'All Meetings & Services', icon: Clock, anyOf: ['events.read'] },
      { href: '/admin/services', label: 'Recurring Service Series', icon: Layers, anyOf: ['events.read'] },
      { href: '/admin/meetings/dashboard', label: 'Operations & Feature Board', icon: Kanban, anyOf: ['events.read'] },
      { href: '/admin/live-meeting', label: 'Live Roster Session', icon: Flame, anyOf: ['attendance.mark'] },
    ],
  },
  {
    key: 'attendance',
    label: 'Attendance & Analytics',
    icon: BarChart3,
    anyOf: ['reports.view', 'attendance.read'],
    children: [
      { href: '/admin/reports', label: 'Overview & Trends', icon: BarChart3, anyOf: ['reports.view'] },
    ],
  },
  {
    key: 'tracking',
    label: 'Tracking & Approvals',
    icon: CheckSquare,
    anyOf: ['approvals.read', 'approvals.act', 'excuses.review'],
    children: [
      { href: '/admin/approvals', label: 'Approvals Center', icon: CheckSquare, anyOf: ['approvals.read', 'approvals.act'] },
      { href: '/admin/absence-requests', label: 'Absence Requests', icon: FileText, anyOf: ['excuses.review'] },
      { href: '/admin/follow-up', label: 'Follow-Up & Flags', icon: AlertTriangle, anyOf: ['excuses.review'] },
    ],
  },
  {
    key: 'finance',
    label: 'Finance & Stewardship',
    icon: DollarSign,
    anyOf: ['dues.read', 'payments.read', 'expenses.read'],
    children: [
      { href: '/admin/finance', label: 'Finance Overview', icon: DollarSign, anyOf: ['dues.read', 'payments.read'] },
      { href: '/admin/finance/dues', label: 'Monthly Dues', icon: Calendar, anyOf: ['dues.read'] },
      { href: '/admin/finance/payments', label: 'Payments & Receipts', icon: CheckSquare, anyOf: ['payments.read'] },
      { href: '/admin/finance/expenses', label: 'Expenses & Budget', icon: FileText, anyOf: ['expenses.read'] },
      { href: '/admin/finance/accounts', label: 'Payment Accounts', icon: Building2, anyOf: ['payments.configure'] },
    ],
  },
  {
    key: 'chat',
    label: 'Team Messages & Chat',
    icon: MessageSquare,
    href: '/admin/chat',
  },
  {
    key: 'administration',
    label: 'Administration',
    icon: Shield,
    anyOf: ['users.read', 'roles.read', 'settings.read', 'audit.read', 'lookups.read'],
    children: [
      { href: '/admin/administration/team', label: 'Admin Team', icon: Users, anyOf: ['users.read'] },
      { href: '/admin/administration/roles', label: 'Roles & Permissions', icon: Shield, anyOf: ['roles.read'] },
      { href: '/admin/administration/lookups', label: 'Lookup Tables', icon: FolderTree, anyOf: ['lookups.read'] },
      { href: '/admin/settings', label: 'System Settings', icon: Settings, anyOf: ['settings.read'] },
      { href: '/admin/audit', label: 'Audit Logs', icon: History, anyOf: ['audit.read'] },
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

  // Navigation states
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [openParents, setOpenParents] = useState<Record<string, boolean>>({});

  // Dropdowns & modals
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [selectedCampus, setSelectedCampus] = useState('Main Campus (TFHC)');

  const quickActionRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Auto-expand parent menu if current route matches any child
  useEffect(() => {
    NAVIGATION_TREE.forEach((parent) => {
      if (parent.children) {
        const isChildActive = parent.children.some((child) =>
          child.exact ? pathname === child.href : pathname.startsWith(child.href)
        );
        if (isChildActive) {
          setOpenParents((prev) => ({ ...prev, [parent.key]: true }));
        }
      }
    });
  }, [pathname]);

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

  // Close mobile drawer on route navigation
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [pathname]);

  const toggleParent = (key: string) => {
    setOpenParents((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  // Filter navigation tree by permissions
  const authorizedTree = useMemo(() => {
    return NAVIGATION_TREE.filter((parent) => {
      if (parent.anyOf && !canAny(...parent.anyOf)) return false;
      if (parent.children) {
        const visibleChildren = parent.children.filter((c) => !c.anyOf || canAny(...c.anyOf));
        return visibleChildren.length > 0;
      }
      return true;
    }).map((parent) => {
      if (!parent.children) return parent;
      return {
        ...parent,
        children: parent.children.filter((c) => !c.anyOf || canAny(...c.anyOf)),
      };
    });
  }, [canAny]);

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col antialiased">
      <GlobalSearchModal isOpen={searchModalOpen} onClose={() => setSearchModalOpen(false)} />

      {/* Top Navbar Header */}
      <header className="sticky top-0 z-30 h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between px-4 lg:px-6 shadow-xs">
        <div className="flex items-center gap-3">
          {/* Mobile & Tablet Hamburger Toggle */}
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none"
            aria-label="Open navigation drawer"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Desktop Sidebar Width Toggle Button */}
          <button
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            className="hidden lg:flex p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>

          {/* Brand Logo & Name */}
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
          <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 ml-2 border border-slate-200/60 dark:border-slate-700/60">
            <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="font-medium truncate max-w-[150px]">{selectedCampus}</span>
          </div>
        </div>

        {/* Center / Right controls */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Breadcrumb Trail on larger screens */}
          <div className="hidden md:block mr-2">
            <AdminBreadcrumb />
          </div>

          {/* Omni Search Button */}
          <button
            onClick={() => setSearchModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-all border border-slate-200/70 dark:border-slate-700/70 text-xs sm:text-sm font-medium w-32 sm:w-56"
          >
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="truncate hidden sm:inline">Search (CMD+K)...</span>
            <span className="truncate sm:hidden">Search...</span>
            <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 ml-auto">
              ⌘K
            </kbd>
          </button>

          {/* Quick Action Dropdown */}
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

          {/* Theme Switcher Header Action */}
          <ThemeSwitcher variant="dropdown" />

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
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-800 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
                </div>
                
                {/* Theme Selector inside Profile Menu */}
                <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Theme Preference</p>
                  <ThemeSwitcher variant="segmented" className="w-full justify-between" />
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

      {/* Main App Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Mobile / Tablet Slide-Over Drawer Backdrop */}
        {mobileDrawerOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden backdrop-blur-sm transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
          />
        )}

        {/* Sidebar (Desktop Persistent + Mobile/Tablet Slide-Over Drawer) */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 flex flex-col transition-all duration-200 ease-in-out lg:static ${
            mobileDrawerOpen ? 'translate-x-0 w-72 shadow-2xl' : '-translate-x-full lg:translate-x-0'
          } ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-[270px]'}`}
        >
          {/* Mobile Drawer Header */}
          <div className="lg:hidden flex items-center justify-between p-4 border-b border-slate-200/80 dark:border-slate-800">
            <span className="font-extrabold text-sm text-slate-900 dark:text-white">Admin Navigation</span>
            <button
              onClick={() => setMobileDrawerOpen(false)}
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Accordion Tree */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin">
            {authorizedTree.map((item) => {
              const Icon = item.icon;
              const hasChildren = Boolean(item.children && item.children.length > 0);
              const isOpen = Boolean(openParents[item.key]);

              // Check if parent or any child is currently active
              const isDirectActive = item.href
                ? item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href)
                : false;

              const isChildActive = hasChildren
                ? item.children!.some((c) => (c.exact ? pathname === c.href : pathname.startsWith(c.href)))
                : false;

              // Direct link without children (e.g. Dashboard, Chat)
              if (!hasChildren && item.href) {
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
                      isDirectActive
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-transform ${
                          isDirectActive ? 'text-white' : 'text-slate-400 dark:text-slate-400 group-hover:text-indigo-600'
                        }`}
                      />
                      {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                    </div>
                    {!sidebarCollapsed && item.badge && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              }

              // Parent Menu with Accordion Children
              return (
                <div key={item.key} className="space-y-1 pt-1">
                  {/* Parent Button */}
                  <button
                    onClick={() => toggleParent(item.key)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all group ${
                      isChildActive
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isChildActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-400 group-hover:text-indigo-600'
                        }`}
                      />
                      {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                    </div>

                    {!sidebarCollapsed && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.badge && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {item.badge}
                          </span>
                        )}
                        <ChevronRight
                          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                            isOpen ? 'rotate-90' : ''
                          }`}
                        />
                      </div>
                    )}
                  </button>

                  {/* Child Menu Accordion List */}
                  {!sidebarCollapsed && isOpen && item.children && (
                    <div className="ml-5 pl-3 border-l-2 border-slate-200/80 dark:border-slate-800 space-y-0.5 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                      {item.children.map((child) => {
                        const isChildActiveCurrent = child.exact
                          ? pathname === child.href
                          : pathname.startsWith(child.href);
                        const ChildIcon = child.icon;

                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                              isChildActiveCurrent
                                ? 'bg-indigo-600 text-white shadow-xs font-bold'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {ChildIcon && (
                                <ChildIcon
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    isChildActiveCurrent ? 'text-white' : 'text-slate-400'
                                  }`}
                                />
                              )}
                              <span className="truncate">{child.label}</span>
                            </div>

                            {child.badge && (
                              <span
                                className={`px-1.5 py-0.2 text-[10px] font-bold rounded ${
                                  isChildActiveCurrent
                                    ? 'bg-indigo-700 text-white'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600'
                                }`}
                              >
                                {child.badge}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Sidebar Status Footer */}
          {!sidebarCollapsed && (
            <div className="p-3 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Theme</span>
                <ThemeSwitcher variant="segmented" />
              </div>
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
          )}
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden min-h-[calc(100vh-4rem)] p-3 sm:p-6 lg:p-8 pb-24 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/90 dark:border-slate-800 px-2 py-1.5 shadow-lg flex items-center justify-around">
        {[
          { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
          { href: '/admin/members', label: 'People', icon: Users },
          { href: '/admin/calendar', label: 'Activities', icon: Calendar },
          { href: '/admin/meetings/dashboard', label: 'Operations', icon: Layers },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl text-[10px] font-bold transition-all ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400 scale-105'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMobileDrawerOpen(true)}
          className="flex flex-col items-center justify-center py-1 px-3 rounded-xl text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
        >
          <Menu className="w-5 h-5 mb-0.5" />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
};
