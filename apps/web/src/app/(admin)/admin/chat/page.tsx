'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  Search,
  Plus,
  SlidersHorizontal,
  Megaphone,
  Radio,
  CheckCircle2,
  Shield,
  Lock,
  Download,
  Paperclip,
  Smile,
  Mic,
  Send,
  MoreVertical,
  BookOpen,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  CheckCheck,
  Phone,
  Video,
  Users,
  Building2,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Flame,
  UserPlus,
  RefreshCw,
  Clock,
  HeartHandshake,
  ThumbsUp,
  X,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { useAuth } from '../../../../lib/auth';
import { useToast } from '../../../../components/ui';

interface ChannelItem {
  id: string;
  name: string;
  type: 'group' | 'direct' | 'broadcast' | 'pastoral';
  categoryTag?: string;
  categoryTagTone?: string;
  lastMessage: string;
  lastSender?: string;
  time: string;
  unreadCount?: number;
  isOnline?: boolean;
  isLocked?: boolean;
  avatarUrl?: string;
  avatarInitials: string;
  avatarBg: string;
  membersCount?: number;
  deliveryStatus?: 'read' | 'delivered' | 'sent';
  department?: string;
}

const CHANNELS: ChannelItem[] = [
  {
    id: 'ch-1',
    name: 'Deacons Board & Governance',
    type: 'group',
    categoryTag: 'Pastoral Council',
    categoryTagTone: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
    lastMessage: 'Agenda PDF has been updated for the capital expenditure...',
    lastSender: 'Elder Marcus',
    time: '10:42 AM',
    unreadCount: 3,
    isOnline: true,
    avatarInitials: 'DB',
    avatarBg: 'bg-indigo-600',
    membersCount: 12,
    deliveryStatus: 'read',
    department: 'Governance & Synod',
  },
  {
    id: 'ch-2',
    name: 'Grace Pastoral Care Triage',
    type: 'pastoral',
    categoryTag: 'Confidential Vault',
    categoryTagTone: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    lastMessage: 'Follow-up visit with sister Clara scheduled for Tuesday...',
    lastSender: 'Pastor Sarah',
    time: '10:15 AM',
    isLocked: true,
    avatarInitials: 'PC',
    avatarBg: 'bg-amber-600',
    membersCount: 6,
    deliveryStatus: 'read',
    department: 'Pastoral Counseling',
  },
  {
    id: 'ch-3',
    name: 'Advent Choral & Orchestra',
    type: 'group',
    categoryTag: 'Music Dept',
    categoryTagTone: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
    lastMessage: '🎵 Audio stems uploaded for rehearsal track #4...',
    lastSender: 'Julian Vance',
    time: '09:30 AM',
    unreadCount: 1,
    avatarInitials: 'AC',
    avatarBg: 'bg-purple-600',
    membersCount: 48,
    deliveryStatus: 'delivered',
    department: 'Music & Liturgy',
  },
  {
    id: 'ch-4',
    name: 'Youth Ministry Volunteer Leadership',
    type: 'group',
    categoryTag: 'Youth & Young Adults',
    categoryTagTone: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    lastMessage: 'Parent permission slips collected for the winter retreat.',
    lastSender: 'Thomas Hayes',
    time: 'Yesterday',
    avatarInitials: 'YM',
    avatarBg: 'bg-blue-600',
    membersCount: 24,
    deliveryStatus: 'read',
    department: 'Discipleship',
  },
  {
    id: 'ch-5',
    name: 'Marcus & Clara Sterling',
    type: 'direct',
    categoryTag: "St. John's Ward",
    categoryTagTone: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
    lastMessage: 'Thank you Pastor David for the phone call and prayer today.',
    lastSender: 'Marcus',
    time: 'Yesterday',
    avatarInitials: 'MS',
    avatarBg: 'bg-emerald-600',
    deliveryStatus: 'read',
    department: 'Parishioners',
  },
  {
    id: 'ch-6',
    name: 'Thanksgiving Outreach Volunteers',
    type: 'broadcast',
    categoryTag: 'Outreach & Missions',
    categoryTagTone: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    lastMessage: 'Broadcast sent: Packing shift reminder dispatched to 142...',
    time: 'Nov 10',
    avatarInitials: 'TO',
    avatarBg: 'bg-rose-600',
    membersCount: 142,
    deliveryStatus: 'delivered',
    department: 'Community Outreach',
  },
];

interface ChatMsg {
  id: string;
  senderName: string;
  senderRole?: string;
  senderAvatar: string;
  senderBg: string;
  isSelf?: boolean;
  time: string;
  replyTo?: {
    sender: string;
    text: string;
  };
  text: string;
  attachment?: {
    name: string;
    size: string;
    status: string;
    type: 'pdf' | 'excel' | 'image';
  };
  reactions?: { emoji: string; count: number }[];
}

const DEFAULT_MESSAGES: ChatMsg[] = [
  {
    id: 'm-1',
    senderName: 'Elder Marcus Sterling',
    senderRole: 'Governance',
    senderAvatar: 'EM',
    senderBg: 'bg-indigo-600',
    time: '10:38 AM',
    replyTo: {
      sender: 'Pastor David Chen',
      text: 'Please ensure the audio stems and capital expenditure breakdown are aligned.',
    },
    text: 'Good morning team! Here is the updated budget agenda for the capital expenditure discussion preceding the Advent Banquet. Please review section 4.',
    attachment: {
      name: 'Agenda_Nov_13_v3.pdf',
      size: '2.4 MB',
      status: 'Approved',
      type: 'pdf',
    },
    reactions: [
      { emoji: '🙏', count: 5 },
      { emoji: '👍', count: 3 },
    ],
  },
  {
    id: 'm-2',
    senderName: 'Pastor David Chen',
    senderRole: 'Lead Admin',
    senderAvatar: 'DC',
    senderBg: 'bg-slate-800',
    isSelf: true,
    time: '10:42 AM',
    text: 'Reviewed and officially approved for distribution.',
  },
];

export default function AdminCommunicationsChatPage() {
  const { user } = useAuth();
  const { notify } = useToast();

  const [activeChannelId, setActiveChannelId] = useState<string>('ch-1');
  const [filterTab, setFilterTab] = useState<'all' | 'unread' | 'ministries' | 'pastoral'>('all');
  const [categoryTab, setCategoryTab] = useState<'all' | 'groups' | 'direct' | 'pastoral' | 'archived'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>(DEFAULT_MESSAGES);
  const [inputMessage, setInputMessage] = useState('');
  const [sharedAssetsTab, setSharedAssetsTab] = useState<'files' | 'media' | 'links'>('files');
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeChannel = useMemo(() => {
    return CHANNELS.find((c) => c.id === activeChannelId) ?? CHANNELS[0];
  }, [activeChannelId]);

  const filteredChannels = useMemo(() => {
    return CHANNELS.filter((ch) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          ch.name.toLowerCase().includes(q) ||
          ch.lastMessage.toLowerCase().includes(q) ||
          (ch.categoryTag && ch.categoryTag.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (filterTab === 'unread' && !ch.unreadCount) return false;
      if (filterTab === 'ministries' && ch.type !== 'group') return false;
      if (filterTab === 'pastoral' && ch.type !== 'pastoral') return false;

      if (categoryTab === 'groups' && ch.type !== 'group') return false;
      if (categoryTab === 'direct' && ch.type !== 'direct') return false;
      if (categoryTab === 'pastoral' && ch.type !== 'pastoral') return false;

      return true;
    });
  }, [searchQuery, filterTab, categoryTab]);

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;
    const newMsg: ChatMsg = {
      id: `msg-${Date.now()}`,
      senderName: user?.firstName ? `${user.firstName} ${user.lastName || ''}` : 'Pastor David Chen',
      senderRole: 'Lead Admin',
      senderAvatar: user?.firstName ? user.firstName[0] : 'DC',
      senderBg: 'bg-slate-800',
      isSelf: true,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: inputMessage.trim(),
    };
    setMessages((prev) => [...prev, newMsg]);
    setInputMessage('');
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleInsertScripture = () => {
    const scripture = '“Let all things be done decently and in order.” — 1 Corinthians 14:40';
    setInputMessage((prev) => (prev ? `${prev} ${scripture}` : scripture));
    notify('Scripture reference inserted.', 'info');
  };

  return (
    <AdminLayoutShell>
      <div className="space-y-4 pb-8">
        {/* Top Header & WhatsApp Engine Status Bar */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                COMMUNICATION
              </span>
              <span className="text-slate-300 dark:text-slate-700">/</span>
              <span className="font-bold text-slate-500 dark:text-slate-400">MESSAGES &amp; BROADCASTS</span>
              <span className="text-slate-300 dark:text-slate-700">/</span>
              <span className="font-extrabold text-indigo-600 dark:text-indigo-400">LIVE CHAT ENGINE</span>
            </div>

            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Communications &amp; WhatsApp-Style Messaging Engine
            </h1>
          </div>

          {/* Status Badges Toolbar */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Meta Cloud API (+1-555-ORD-CARE)</span>
            </div>

            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-[11px] font-bold border border-slate-200 dark:border-slate-700">
              <Radio className="w-3.5 h-3.5 text-emerald-500" />
              <span>24ms Latency</span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold">
              <Lock className="w-3.5 h-3.5 text-indigo-500" />
              <span>Pastoral E2EE Active</span>
            </div>

            <button
              onClick={() => notify('Connection refreshed • 0 pending sync packets.', 'success')}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
              title="Refresh WebSocket Stream"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 3-Column WhatsApp / High-Density Chat Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-md overflow-hidden min-h-[720px] lg:h-[calc(100vh-190px)]">
          {/* ============================================================ */}
          {/* COLUMN 1: Conversations List & Filters (Span 3.5) */}
          {/* ============================================================ */}
          <div className="lg:col-span-4 xl:col-span-3 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full bg-white dark:bg-slate-900">
            {/* Header with Quick Actions */}
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-slate-900 dark:text-white">Conversations</h2>
                  <span className="px-2 py-0.2 rounded-md text-[10px] font-black bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400">
                    14 Active
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => notify('Broadcast composer opened.', 'info')}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                    title="Send Broadcast Message"
                  >
                    <Megaphone className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => notify('Filter criteria toggled.', 'info')}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                    title="Filter options"
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => notify('New Message / Channel created.', 'success')}
                    className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                    title="Start New Conversation"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  className="w-full pl-9 pr-8 py-2 bg-slate-100 dark:bg-slate-800/80 border-none rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500"
                  placeholder="Search chats, scriptures, tags (@)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Quick Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'unread', label: 'Unread (8)' },
                  { key: 'ministries', label: 'Ministries (14)' },
                  { key: 'pastoral', label: 'Care & Pastoral' },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilterTab(f.key as any)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold whitespace-nowrap transition-all ${
                      filterTab === f.key
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Category Tab Strip */}
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 border-t border-slate-100 dark:border-slate-800/80 pt-2 px-1">
                {[
                  { key: 'all', label: 'All Channels' },
                  { key: 'groups', label: 'Groups' },
                  { key: 'direct', label: 'Direct' },
                  { key: 'pastoral', label: 'Pastoral Care' },
                  { key: 'archived', label: 'Archived' },
                ].map((cat) => (
                  <button
                    key={cat.key}
                    onClick={() => setCategoryTab(cat.key as any)}
                    className={`pb-1 border-b-2 transition-colors ${
                      categoryTab === cat.key
                        ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-extrabold'
                        : 'border-transparent hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Conversation List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 scrollbar-thin">
              {filteredChannels.map((ch) => {
                const isSelected = ch.id === activeChannelId;
                return (
                  <div
                    key={ch.id}
                    onClick={() => setActiveChannelId(ch.id)}
                    className={`p-3.5 flex items-start gap-3 cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-indigo-50/60 dark:bg-indigo-950/40 border-l-4 border-indigo-600'
                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Avatar with Online/Lock Badges */}
                    <div className="relative shrink-0">
                      <div
                        className={`w-10 h-10 rounded-2xl ${ch.avatarBg} text-white font-black text-xs flex items-center justify-center shadow-xs`}
                      >
                        {ch.avatarInitials}
                      </div>
                      {ch.isOnline && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                      )}
                      {ch.isLocked && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-500 text-white flex items-center justify-center ring-2 ring-white dark:ring-slate-900 text-[8px]">
                          <Lock className="w-2 h-2" />
                        </span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-900 dark:text-white truncate flex items-center gap-1">
                          <span>{ch.name}</span>
                        </h3>
                        <span className="text-[10px] font-medium text-slate-400 shrink-0">{ch.time}</span>
                      </div>

                      <div className="flex items-center gap-1.5 mt-0.5">
                        {ch.lastSender && (
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 shrink-0">
                            {ch.lastSender}:
                          </span>
                        )}
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {ch.lastMessage}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-1.5">
                        {ch.categoryTag ? (
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${ch.categoryTagTone}`}>
                            {ch.categoryTag}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">{ch.department}</span>
                        )}

                        {ch.unreadCount ? (
                          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                            {ch.unreadCount}
                          </span>
                        ) : (
                          <CheckCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ============================================================ */}
          {/* COLUMN 2: Message Stream & WhatsApp Composer (Span 5.5) */}
          {/* ============================================================ */}
          <div className="lg:col-span-8 xl:col-span-6 flex flex-col h-full bg-slate-50/60 dark:bg-slate-950/60 border-r border-slate-200 dark:border-slate-800">
            {/* Active Chat Header */}
            <div className="p-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-10 h-10 rounded-2xl ${activeChannel.avatarBg} text-white font-black text-xs flex items-center justify-center shrink-0`}
                >
                  {activeChannel.avatarInitials}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                      {activeChannel.name}
                    </h2>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      Official Circle
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    {activeChannel.membersCount ? `${activeChannel.membersCount} Ordained Members` : 'Pastoral Direct Line'} • End-to-end Encrypted
                  </p>
                </div>
              </div>

              {/* Action Icons */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => notify('Searching message history...', 'info')}
                  className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                >
                  <Search className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setRightPanelOpen((prev) => !prev)}
                  className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hidden xl:inline-flex"
                  title="Toggle Dossier Details"
                >
                  <Users className="w-4 h-4" />
                </button>
                <button className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Chat Stream Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
              {/* Day Stamp */}
              <div className="flex items-center justify-center">
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  Today, November 13, 2026
                </span>
              </div>

              {/* E2EE Security Banner */}
              <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-3 rounded-2xl text-center space-y-1">
                <div className="flex items-center justify-center gap-1.5 text-amber-800 dark:text-amber-300 text-xs font-bold">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Church Governance Encryption Active</span>
                </div>
                <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 max-w-md mx-auto leading-relaxed">
                  Messages and attachments are end-to-end encrypted under church pastoral governance protocol. No third party or platform administrator can intercept audio or text.
                </p>
              </div>

              {/* Messages Flow */}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 ${msg.isSelf ? 'justify-end' : 'justify-start'}`}
                >
                  {!msg.isSelf && (
                    <div
                      className={`w-8 h-8 rounded-xl ${msg.senderBg} text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-1`}
                    >
                      {msg.senderAvatar}
                    </div>
                  )}

                  <div
                    className={`max-w-md rounded-2xl p-3.5 space-y-2 shadow-xs ${
                      msg.isSelf
                        ? 'bg-indigo-600 text-white rounded-tr-none'
                        : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 rounded-tl-none'
                    }`}
                  >
                    {/* Header line for others */}
                    {!msg.isSelf && (
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-1">
                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">
                          {msg.senderName}
                        </span>
                        {msg.senderRole && (
                          <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
                            {msg.senderRole}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Quoted Message */}
                    {msg.replyTo && (
                      <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 border-l-4 border-indigo-500 text-[11px] text-slate-600 dark:text-slate-300">
                        <p className="font-bold text-indigo-600 dark:text-indigo-400">{msg.replyTo.sender}</p>
                        <p className="truncate opacity-80">{msg.replyTo.text}</p>
                      </div>
                    )}

                    {/* Body Text */}
                    <p className="text-xs leading-relaxed font-medium">{msg.text}</p>

                    {/* Attachment Card */}
                    {msg.attachment && (
                      <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-950 text-rose-600">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {msg.attachment.name}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {msg.attachment.size} • <span className="text-emerald-600 font-bold">{msg.attachment.status}</span>
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => notify(`Downloading ${msg.attachment?.name}...`, 'info')}
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-200 text-slate-600 dark:text-slate-300"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Reactions & Timestamp */}
                    <div className="flex items-center justify-between text-[10px] pt-1">
                      {msg.reactions ? (
                        <div className="flex items-center gap-1">
                          {msg.reactions.map((r, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px] shadow-xs"
                            >
                              {r.emoji} {r.count}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span />
                      )}

                      <div className="flex items-center gap-1 text-slate-400">
                        <span>{msg.time}</span>
                        {msg.isSelf && <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* WhatsApp Composer & Quick Actions Bar */}
            <div className="p-3.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 space-y-2">
              {/* Quick Canned Suggestions */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar text-xs">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 shrink-0">
                  CANNED QUICK:
                </span>
                <button
                  onClick={handleInsertScripture}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 whitespace-nowrap"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Insert Scripture</span>
                </button>
                <button
                  onClick={() => notify('Council Poll generator opened.', 'info')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 whitespace-nowrap"
                >
                  <span>📊 Poll Vote</span>
                </button>
                <button
                  onClick={() => setInputMessage('Approved and logged in synod minutes.')}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 whitespace-nowrap"
                >
                  &quot;Approved and logged&quot;
                </button>
              </div>

              {/* Main Input Row */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => notify('Emoji drawer opened.', 'info')}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Smile className="w-5 h-5" />
                </button>

                <button
                  onClick={() => notify('Attachment picker opened.', 'info')}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Paperclip className="w-5 h-5" />
                </button>

                <input
                  type="text"
                  className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border-none rounded-2xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500"
                  placeholder="Type a message, @mention, or paste scripture reference..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />

                <button
                  onClick={() => notify('Recording pastoral voice memo...', 'info')}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Record Voice Memo"
                >
                  <Mic className="w-5 h-5" />
                </button>

                <button
                  onClick={handleSendMessage}
                  className="p-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 active:scale-95 transition-all"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* COLUMN 3: Council Dossier & Shared Assets (Span 3) */}
          {/* ============================================================ */}
          {rightPanelOpen && (
            <div className="hidden xl:flex xl:col-span-3 border-l border-slate-200 dark:border-slate-800 flex-col h-full bg-white dark:bg-slate-900 p-4 space-y-4 overflow-y-auto scrollbar-thin">
              {/* Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  Council Dossier
                </h3>
                <button className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                  Edit
                </button>
              </div>

              {/* Group Cover & Description */}
              <div className="text-center space-y-2">
                <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-indigo-900 to-slate-900 text-white flex items-center justify-center font-black text-xl shadow-md ring-4 ring-indigo-500/20">
                  <Building2 className="w-8 h-8 text-indigo-400" />
                </div>

                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">
                    {activeChannel.name}
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    Created Sep 14, 2024 • 12 Ordained Officers
                  </p>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed text-left">
                  Official executive communications channel for ordained deacons, executive clergy, and committee chairs regarding campus governance, synod preparations, and stewardship.
                </p>
              </div>

              {/* WhatsApp Business Sync Box */}
              <div className="p-3 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-black text-emerald-900 dark:text-emerald-200">
                    <Radio className="w-3.5 h-3.5 text-emerald-600" />
                    <span>WhatsApp Business Sync</span>
                  </div>
                  <span className="px-1.5 py-0.2 rounded text-[8px] font-black bg-emerald-600 text-white uppercase">
                    VERIFIED
                  </span>
                </div>
                <p className="text-[10px] text-emerald-800/80 dark:text-emerald-300/80 leading-relaxed">
                  Official broadcast gateway routing via Grace Cathedral WhatsApp Cloud node.
                </p>
                <div className="pt-1 flex items-center justify-between text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                  <span>Template Opt-in</span>
                  <span>Enabled (Tier 3)</span>
                </div>
              </div>

              {/* Shared Assets Section */}
              <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900 dark:text-white">Shared Assets</span>
                  <button className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                    View All (165)
                  </button>
                </div>

                {/* Sub-tabs: Files / Media / Links */}
                <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl text-[10px] font-bold text-center">
                  <button
                    onClick={() => setSharedAssetsTab('files')}
                    className={`py-1 rounded-lg transition-all ${
                      sharedAssetsTab === 'files'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Files (34)
                  </button>
                  <button
                    onClick={() => setSharedAssetsTab('media')}
                    className={`py-1 rounded-lg transition-all ${
                      sharedAssetsTab === 'media'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Media (112)
                  </button>
                  <button
                    onClick={() => setSharedAssetsTab('links')}
                    className={`py-1 rounded-lg transition-all ${
                      sharedAssetsTab === 'links'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Links (19)
                  </button>
                </div>

                {/* Files List */}
                <div className="space-y-1.5 pt-1 text-xs">
                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-rose-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white truncate text-[11px]">
                          Synod_Agenda_v3.pdf
                        </p>
                        <p className="text-[9px] text-slate-400">Today • 2.4 MB</p>
                      </div>
                    </div>
                    <button className="p-1 text-slate-400 hover:text-slate-600">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white truncate text-[11px]">
                          Q4_Stewardship_Ledger.xlsx
                        </p>
                        <p className="text-[9px] text-slate-400">Nov 11 • 4.1 MB</p>
                      </div>
                    </div>
                    <button className="p-1 text-slate-400 hover:text-slate-600">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <ImageIcon className="w-4 h-4 text-indigo-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white truncate text-[11px]">
                          Sanctuary_Seating_Map.png
                        </p>
                        <p className="text-[9px] text-slate-400">Nov 08 • 1.8 MB</p>
                      </div>
                    </div>
                    <button className="p-1 text-slate-400 hover:text-slate-600">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Council Officers List */}
              <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900 dark:text-white">Council Officers (12)</span>
                  <button
                    onClick={() => notify('Add Officer modal opened.', 'info')}
                    className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5"
                  >
                    <UserPlus className="w-3 h-3" />
                    <span>Add</span>
                  </button>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-slate-800 text-white font-black text-[10px] flex items-center justify-center shrink-0">
                        DC
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white truncate text-[11px]">
                          Pastor David Chen
                        </p>
                        <p className="text-[9px] text-slate-400 truncate">Senior Pastor • Lead Admin</p>
                      </div>
                    </div>
                    <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400 uppercase">
                      Admin
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-black text-[10px] flex items-center justify-center shrink-0">
                        EM
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white truncate text-[11px]">
                          Elder Marcus Sterling
                        </p>
                        <p className="text-[9px] text-slate-400 truncate">Treasurer • Governance</p>
                      </div>
                    </div>
                    <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 uppercase">
                      Officer
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayoutShell>
  );
}
