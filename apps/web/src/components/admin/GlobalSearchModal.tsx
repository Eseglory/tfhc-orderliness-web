'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Users, Calendar, BarChart3, Clock, ArrowRight, X } from 'lucide-react';
import { fetchApi } from '../../lib/api';

interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string;
  category: 'member' | 'meeting' | 'navigation' | 'report';
  href: string;
  badge?: string;
}

const STATIC_NAV_RESULTS: SearchResultItem[] = [
  { id: 'nav-dashboard', title: 'Dashboard Overview', subtitle: 'Main executive operations and live metrics', category: 'navigation', href: '/admin' },
  { id: 'nav-members', title: 'Members Registry', subtitle: 'Congregational directory and sub-teams', category: 'navigation', href: '/admin/members' },
  { id: 'nav-reports', title: 'Attendance Analytics & Trends', subtitle: 'Detailed service analytics and reports', category: 'navigation', href: '/admin/reports' },
  { id: 'nav-calendar', title: 'Events Calendar', subtitle: 'Church calendar, services, and gatherings', category: 'navigation', href: '/admin/calendar' },
  { id: 'nav-meetings', title: 'All Meetings & Services', subtitle: 'List of all church meetings and events', category: 'navigation', href: '/admin/meetings' },
  { id: 'nav-ops-board', title: 'Operations & Feature Board', subtitle: 'Kanban view of operational tasks', category: 'navigation', href: '/admin/meetings/dashboard' },
  { id: 'nav-approvals', title: 'Pending Approvals & Excuses', subtitle: 'Absence excuses, corrections, welfare requests', category: 'navigation', href: '/admin/approvals' },
  { id: 'nav-finance', title: 'Finance & Stewardship', subtitle: 'Monthly dues, collections, and expenses', category: 'navigation', href: '/admin/finance' },
  { id: 'nav-follow-up', title: 'Follow-Up & Alerts', subtitle: 'Member follow-up flags and pastoral care', category: 'navigation', href: '/admin/follow-up' },
  { id: 'nav-chat', title: 'Team Messages & Chat', subtitle: 'Unit and sub-team communications', category: 'navigation', href: '/admin/chat' },
  { id: 'nav-settings', title: 'Admin Settings', subtitle: 'System policies and configuration', category: 'navigation', href: '/admin/settings' },
];

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose }) => {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>(STATIC_NAV_RESULTS);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    } else {
      setQuery('');
      setResults(STATIC_NAV_RESULTS);
    }
  }, [isOpen]);

  // Handle dynamic search for members & meetings
  useEffect(() => {
    if (!isOpen) return;
    const q = query.trim().toLowerCase();
    if (!q) {
      setResults(STATIC_NAV_RESULTS);
      setLoading(false);
      return;
    }

    const filteredNav = STATIC_NAV_RESULTS.filter(
      (item) => item.title.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q)
    );

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const [membersData, meetingsData] = await Promise.all([
          fetchApi<any[]>('/members').catch(() => []),
          fetchApi<any[]>('/meetings?limit=20').catch(() => []),
        ]);

        const matchedMembers: SearchResultItem[] = (membersData || [])
          .filter((m: any) => {
            const name = `${m.firstName || ''} ${m.lastName || ''}`.toLowerCase();
            const email = (m.email || '').toLowerCase();
            const phone = (m.phoneNumber || '').toLowerCase();
            const code = (m.memberCode || '').toLowerCase();
            return name.includes(q) || email.includes(q) || phone.includes(q) || code.includes(q);
          })
          .slice(0, 5)
          .map((m: any) => ({
            id: `member-${m.id}`,
            title: `${m.firstName} ${m.lastName}`,
            subtitle: `${m.subTeam?.name ? `${m.subTeam.name} • ` : ''}${m.phoneNumber || m.email || 'Member'}`,
            category: 'member',
            href: `/admin/members?search=${encodeURIComponent(m.firstName + ' ' + m.lastName)}`,
            badge: m.status || 'ACTIVE',
          }));

        const matchedMeetings: SearchResultItem[] = (meetingsData || [])
          .filter((m: any) => (m.title || '').toLowerCase().includes(q))
          .slice(0, 4)
          .map((m: any) => ({
            id: `meeting-${m.id}`,
            title: m.title,
            subtitle: `${new Date(m.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} • ${m.category?.name || 'Service'}`,
            category: 'meeting',
            href: `/admin/meetings/${m.id}`,
            badge: m.status,
          }));

        setResults([...filteredNav, ...matchedMembers, ...matchedMeetings]);
      } catch {
        setResults(filteredNav);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  const handleSelect = useCallback(
    (item: SearchResultItem) => {
      onClose();
      router.push(item.href);
    },
    [onClose, router]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl bg-surface-container-lowest dark:bg-slate-900 rounded-2xl shadow-2xl border border-outline-variant/30 dark:border-slate-800 overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-outline-variant/20 dark:border-slate-800">
          <Search className="w-5 h-5 text-on-surface-variant dark:text-slate-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search congregants, meetings, reports, rosters (or jump to page)..."
            className="w-full bg-transparent text-sm sm:text-base text-on-surface dark:text-slate-100 placeholder:text-on-surface-variant/60 dark:placeholder:text-slate-500 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[11px] font-mono text-on-surface-variant dark:text-slate-400 bg-surface-container-low dark:bg-slate-800 rounded border border-outline-variant/30 dark:border-slate-700 ml-2">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 divide-y divide-outline-variant/10 dark:divide-slate-800/60">
          {loading && (
            <div className="p-4 text-center text-xs text-on-surface-variant dark:text-slate-400">
              Searching campus databases...
            </div>
          )}

          {!loading && results.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm font-semibold text-on-surface dark:text-slate-200">No results found</p>
              <p className="text-xs text-on-surface-variant dark:text-slate-400 mt-1">
                Try searching for a member name, meeting title, or navigation keyword.
              </p>
            </div>
          )}

          {results.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={item.id}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-primary-container/10 dark:bg-slate-800 text-primary-container dark:text-white'
                    : 'hover:bg-surface-container-low dark:hover:bg-slate-800/50 text-on-surface dark:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      item.category === 'member'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                        : item.category === 'meeting'
                        ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400'
                        : 'bg-surface-container-high text-on-surface-variant dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {item.category === 'member' && <Users className="w-4 h-4" />}
                    {item.category === 'meeting' && <Calendar className="w-4 h-4" />}
                    {item.category === 'navigation' && <ArrowRight className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate flex items-center gap-2">
                      {item.title}
                      {item.badge && (
                        <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-md uppercase bg-surface-container-high text-on-surface-variant dark:bg-slate-700 dark:text-slate-300">
                          {item.badge}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-on-surface-variant dark:text-slate-400 truncate">{item.subtitle}</p>
                  </div>
                </div>
                <ArrowRight className={`w-4 h-4 shrink-0 ml-2 transition-transform ${isSelected ? 'translate-x-1 opacity-100' : 'opacity-0'}`} />
              </div>
            );
          })}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-surface-container-low/60 dark:bg-slate-950/60 border-t border-outline-variant/20 dark:border-slate-800 text-[11px] text-on-surface-variant dark:text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 font-mono bg-surface-container-highest dark:bg-slate-800 rounded border border-outline-variant/30 dark:border-slate-700">↑</kbd>
              <kbd className="ml-1 px-1.5 py-0.5 font-mono bg-surface-container-highest dark:bg-slate-800 rounded border border-outline-variant/30 dark:border-slate-700">↓</kbd> navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 font-mono bg-surface-container-highest dark:bg-slate-800 rounded border border-outline-variant/30 dark:border-slate-700">↵</kbd> select
            </span>
          </div>
          <span>TFHC Omni-Search Engine</span>
        </div>
      </div>
    </div>
  );
};
