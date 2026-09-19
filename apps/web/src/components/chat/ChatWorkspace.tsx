'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useToast } from '../ui';
import {
  ChatContact,
  ChatMessage,
  ChatRoom,
  chatApi,
  dayLabel,
  useChatSocket,
} from '../../lib/chat';
import { Avatar } from './Avatar';
import { MessageBubble, SystemLine } from './MessageBubble';
import { useUpload } from '../UploadProgress';
import { Composer } from './Composer';
import { ContactPickerModal, ManageMembersModal, NewRoomModal } from './ChatModals';

const ROOM_ICON: Record<string, string> = {
  GENERAL: 'forum',
  EXECUTIVES: 'shield_person',
  DISCIPLINARY: 'gavel',
  CUSTOM: 'groups',
  DIRECT: 'person',
};

function roomIcon(room: ChatRoom): string {
  if (room.key === 'DISCIPLINARY') return 'gavel';
  return ROOM_ICON[room.type] ?? 'chat';
}

export function ChatWorkspace({
  deepLinkRoomId,
  /** Extra bottom inset to clear a fixed bottom bar (member app BottomNav). */
  bottomInset = '0rem',
}: {
  deepLinkRoomId?: string | null;
  bottomInset?: string;
}) {
  const { user, can } = useAuth();
  const { notify } = useToast();
  const isSuperOwner = user?.email?.toLowerCase() === 'engreseglory@gmail.com';
  const canManage = isSuperOwner;
  const canModerate = isSuperOwner || can('messages.moderate');

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeId, setActiveId] = useState<string | null>(deepLinkRoomId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [roomFilter, setRoomFilter] = useState<'ALL' | 'UNREAD' | 'DIRECT' | 'GROUPS'>('ALL');
  const [inChatSearch, setInChatSearch] = useState('');
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [roomMembers, setRoomMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [contacts, setContacts] = useState<ChatContact[]>([]);

  const [typingBy, setTypingBy] = useState<Record<string, string>>({});
  const [roomTyping, setRoomTyping] = useState<Record<string, boolean>>({});
  const [showContacts, setShowContacts] = useState(false);
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [mobileThread, setMobileThread] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(activeId);
  activeIdRef.current = activeId;
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const activeRoom = useMemo(() => rooms.find((r) => r.id === activeId) ?? null, [rooms, activeId]);

  const loadRooms = useCallback(async () => {
    try {
      setRooms(await chatApi.rooms());
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not load conversations.', 'error');
    }
  }, [notify]);

  useEffect(() => {
    void loadRooms();
    chatApi
      .contacts()
      .then(setContacts)
      .catch(() => undefined);
  }, [loadRooms]);

  const scrollToBottom = useCallback((smooth = false) => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    });
  }, []);

  const markRoomRead = useCallback(
    (roomId: string, messageId?: string) => {
      setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, unreadCount: 0 } : r)));
      chatApi.markRead(roomId, messageId).catch(() => undefined);
      socket.sendRead(roomId, messageId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const openRoom = useCallback(
    async (roomId: string) => {
      activeIdRef.current = roomId;
      setActiveId(roomId);
      setMobileThread(true);
      setReplyTo(null);
      setEditing(null);
      setInChatSearch('');
      setShowInChatSearch(false);
      setShowRoomInfo(false);
      setLoadingRoom(true);
      socket.subscribe(roomId);
      markRoomRead(roomId);
      try {
        const page = await chatApi.messages(roomId);
        setMessages(page.messages);
        setNextCursor(page.nextCursor);
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Could not load messages.', 'error');
      } finally {
        setLoadingRoom(false);
        scrollToBottom();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markRoomRead, notify, scrollToBottom],
  );

  const loadRoomMembers = useCallback(async (roomId: string) => {
    try {
      setLoadingMembers(true);
      const data = await chatApi.roomMembers(roomId);
      setRoomMembers(data || []);
    } catch (err) {
      console.error('Failed to load room members:', err);
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  useEffect(() => {
    if (showRoomInfo && activeId) {
      void loadRoomMembers(activeId);
    }
  }, [showRoomInfo, activeId, loadRoomMembers]);

  const loadMore = async () => {
    if (!activeId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    const prevHeight = scrollRef.current?.scrollHeight ?? 0;
    try {
      const page = await chatApi.messages(activeId, nextCursor);
      setMessages((prev) => [...page.messages, ...prev]);
      setNextCursor(page.nextCursor);
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not load earlier messages.', 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const socket = useChatSocket({
    onReady: ({ online: list }) => {
      // Refresh room list unread & latest messages when socket reconnects
      if (!activeIdRef.current) return;
      const current = activeIdRef.current;
      chatApi.messages(current).then((page) => {
        if (activeIdRef.current !== current) return;
        setMessages((previous) => {
          const ids = new Set(page.messages.map(m => m.id));
          const newest = page.messages[page.messages.length - 1]?.createdAt ?? '';
          return [...page.messages, ...previous.filter(message => message.pending ||
            (!ids.has(message.id) && message.createdAt > newest))];
        });
        setNextCursor(page.nextCursor);
      }).catch(() => undefined);
    },
    onMessage: (m) => {
      if (m.roomId === activeIdRef.current) {
        setMessages((prev) => {
          if (prev.some((x) => x.id === m.id)) return prev;
          if (m.mine && prev.some((x) => x.pending && x.body === m.body)) return prev;
          return [...prev, m];
        });
        markRoomRead(m.roomId, m.id);
        scrollToBottom(true);
      }
      setRooms((prev) => {
        const found = prev.find((r) => r.id === m.roomId);
        const bump =
          found && m.roomId !== activeIdRef.current && !m.mine
            ? { ...found, lastMessage: m, unreadCount: found.unreadCount + 1 }
            : found
              ? { ...found, lastMessage: m }
              : null;
        if (!bump) {
          void loadRooms();
          return prev;
        }
        return [bump, ...prev.filter((r) => r.id !== m.roomId)];
      });
    },
    onMessageUpdate: (m) => {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      setRooms((prev) => prev.map((r) => (r.lastMessage?.id === m.id ? { ...r, lastMessage: m } : r)));
    },
    onTyping: (e) => {
      // Update global room typing for sidebar
      setRoomTyping((prev) => ({ ...prev, [e.roomId]: e.typing }));

      if (e.roomId !== activeIdRef.current) return;
      setTypingBy((prev) => {
        const next = { ...prev };
        if (e.typing) next[e.memberId] = e.name || 'Someone';
        else delete next[e.memberId];
        return next;
      });
      clearTimeout(typingTimers.current[e.memberId]);
      if (e.typing) {
        typingTimers.current[e.memberId] = setTimeout(() => {
          setTypingBy((prev) => {
            const next = { ...prev };
            delete next[e.memberId];
            return next;
          });
          setRoomTyping((prev) => ({ ...prev, [e.roomId]: false }));
        }, 4000);
      }
    },
  });

  // Deep-link open once rooms are available.
  useEffect(() => {
    if (deepLinkRoomId && rooms.some((r) => r.id === deepLinkRoomId) && activeId !== deepLinkRoomId) {
      void openRoom(deepLinkRoomId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkRoomId, rooms]);

  const mergeSaved = (tempId: string, saved: ChatMessage) =>
    setMessages((prev) => {
      const next = prev.filter((m) => m.id !== tempId);
      return next.some((m) => m.id === saved.id) ? next : [...next, saved];
    });

  const handleSendText = async (text: string) => {
    const roomId = activeIdRef.current;
    if (!roomId) return;
    if (editing) {
      try {
        const updated = await chatApi.edit(editing.id, text);
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        setEditing(null);
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Could not edit the message.', 'error');
        throw e;
      }
      return;
    }
    const clientId = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const tempId = clientId;
    const optimistic: ChatMessage = {
      id: tempId,
      roomId,
      type: 'TEXT',
      body: text,
      attachmentUrl: null,
      attachmentMeta: null,
      replyToId: replyTo?.id ?? null,
      replyTo: replyTo ? { id: replyTo.id, body: replyTo.body, senderName: replyTo.sender?.name ?? null } : null,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      sender: null,
      mine: true,
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    scrollToBottom(true);
    const replyId = replyTo?.id;
    setReplyTo(null);
    try {
      const saved = await socket.sendMessage({
        roomId,
        body: text,
        replyToId: replyId,
        clientId,
      });
      mergeSaved(tempId, saved);
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      notify(e instanceof Error ? e.message : 'Message failed to send.', 'error');
      throw e;
    }
  };

  const upload = useUpload(message => { mergeSaved('', message); scrollToBottom(true); });
  const handleAttach = async (file: File) => {
    const roomId = activeIdRef.current;
    if (roomId) await upload.start(roomId, file, replyTo?.id);
  };

  const handleDelete = async (m: ChatMessage) => {
    try {
      const updated = await chatApi.remove(m.id);
      setMessages((prev) => prev.map((x) => (x.id === m.id ? updated : x)));
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not delete the message.', 'error');
    }
  };

  const startDirect = async (memberId: string) => {
    setShowContacts(false);
    try {
      const room = await chatApi.direct(memberId);
      setRooms((prev) => (prev.some((r) => r.id === room.id) ? prev : [room, ...prev]));
      await openRoom(room.id);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not start the conversation.', 'error');
    }
  };

  // Filtered rooms list
  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;
      if (roomFilter === 'UNREAD') return r.unreadCount > 0;
      if (roomFilter === 'DIRECT') return r.type === 'DIRECT';
      if (roomFilter === 'GROUPS') return r.type !== 'DIRECT';
      return true;
    });
  }, [rooms, search, roomFilter]);

  // Filtered contacts list for user search
  const filteredContacts = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.roleInUnit && c.roleInUnit.toLowerCase().includes(q)) ||
        (c.subTeam && c.subTeam.toLowerCase().includes(q)),
    );
  }, [contacts, search]);

  const totalUnread = rooms.reduce((s, r) => s + r.unreadCount, 0);

  // Filter messages by in-chat search query if active
  const displayedMessages = useMemo(() => {
    if (!inChatSearch.trim()) return messages;
    const q = inChatSearch.toLowerCase();
    return messages.filter((m) => m.body?.toLowerCase().includes(q) || m.sender?.name.toLowerCase().includes(q));
  }, [messages, inChatSearch]);

  const grouped: { day: string; items: ChatMessage[] }[] = [];
  for (const m of displayedMessages) {
    const label = dayLabel(m.createdAt);
    const last = grouped[grouped.length - 1];
    if (last && last.day === label) last.items.push(m);
    else grouped.push({ day: label, items: [m] });
  }

  const typingNames = Object.values(typingBy);
  const canManageRoom =
    !!activeRoom && activeRoom.type === 'CUSTOM' && (canManage || activeRoom.role === 'MODERATOR');

  const isDirectOnline =
    activeRoom?.type === 'DIRECT' && activeRoom.direct ? socket.online.has(activeRoom.direct.memberId) : false;

  return (
    <div
      className="flex w-full h-full min-h-0 flex-1 overflow-hidden border-x border-outline-variant/20 bg-surface-container-low"
      style={bottomInset !== '0rem' ? { height: `calc(100vh - 4rem - ${bottomInset})` } : undefined}
    >
      {/* Sidebar: Conversation List */}
      <aside
        className={`flex w-full flex-col border-r border-outline-variant/20 bg-surface-container-lowest sm:w-84 md:w-96 shrink-0 ${
          mobileThread ? 'hidden sm:flex' : 'flex'
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between gap-2 border-b border-outline-variant/20 px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black tracking-tight text-on-surface">Chat</h2>
            {totalUnread > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-on-primary">
                {totalUnread}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowContacts(true)}
              className="rounded-xl p-2 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
              title="New direct message"
              aria-label="New message"
            >
              <span className="material-symbols-outlined text-[22px]">edit_square</span>
            </button>
            {canManage && (
              <button
                onClick={() => setShowNewRoom(true)}
                className="rounded-xl p-2 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
                title="Create new channel"
                aria-label="New room"
              >
                <span className="material-symbols-outlined text-[22px]">group_add</span>
              </button>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-3 pt-2 pb-1.5">
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-3 text-sm text-on-surface-variant">
              search
            </span>
            <input
              className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low pl-9 pr-8 py-2 text-xs text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
              placeholder="Search chats or members…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 rounded-full p-0.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                title="Clear search"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills (WhatsApp Style) */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-outline-variant/15 overflow-x-auto no-scrollbar">
          {(['ALL', 'UNREAD', 'GROUPS', 'DIRECT'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setRoomFilter(tab)}
              className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all shrink-0 ${
                roomFilter === tab
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {tab === 'ALL' ? 'All' : tab === 'UNREAD' ? 'Unread' : tab === 'GROUPS' ? 'Groups' : 'Direct'}
            </button>
          ))}
        </div>

        {/* Rooms & Contacts Scroll List */}
        <div className="flex-1 overflow-y-auto">
          {search.trim() ? (
            /* Search Results (Both Chats and Users) */
            filteredRooms.length === 0 && filteredContacts.length === 0 ? (
              <div className="p-8 text-center text-xs text-on-surface-variant space-y-1">
                <span className="material-symbols-outlined text-3xl opacity-50">person_search</span>
                <p className="font-semibold text-on-surface">No chats or members found</p>
                <p className="text-[11px] text-on-surface-variant">No results matching “{search}”</p>
              </div>
            ) : (
              <div>
                {filteredRooms.length > 0 && (
                  <div>
                    <div className="px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant bg-surface-container-low/70 border-b border-outline-variant/10">
                      Chats ({filteredRooms.length})
                    </div>
                    {filteredRooms.map((r) => {
                      const isDirect = r.type === 'DIRECT';
                      const presenceOnline = isDirect && r.direct ? socket.online.has(r.direct.memberId) : undefined;
                      const isTyping = roomTyping[r.id];

                      return (
                        <button
                          key={r.id}
                          onClick={() => {
                            setSearch('');
                            openRoom(r.id);
                          }}
                          className={`flex w-full items-center gap-3 border-b border-outline-variant/10 px-3.5 py-3 text-left transition-all ${
                            r.id === activeId
                              ? 'bg-surface-container border-l-4 border-l-primary'
                              : 'hover:bg-surface-container-low'
                          }`}
                        >
                          <Avatar
                            name={r.name}
                            photoUrl={isDirect ? r.direct?.photoUrl : r.imageUrl}
                            icon={isDirect ? undefined : roomIcon(r)}
                            online={presenceOnline}
                            size={42}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-bold text-on-surface">{r.name}</span>
                              {r.lastMessage && (
                                <span className="shrink-0 text-[10px] font-medium text-on-surface-variant">
                                  {new Date(r.lastMessage.createdAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              )}
                            </span>
                            <span className="flex items-center justify-between gap-2 mt-0.5">
                              {isTyping ? (
                                <span className="truncate text-xs font-bold text-emerald-500 animate-pulse flex items-center gap-1">
                                  <span>typing…</span>
                                </span>
                              ) : (
                                <span className="truncate text-xs text-on-surface-variant">
                                  {r.lastMessage
                                    ? `${r.lastMessage.type !== 'TEXT' && r.lastMessage.type !== 'SYSTEM' ? '📎 ' : ''}${
                                        r.lastMessage.deletedAt ? 'Message deleted' : r.lastMessage.body || 'Attachment'
                                      }`
                                    : r.description || 'No messages yet'}
                                </span>
                              )}
                              {r.unreadCount > 0 && (
                                <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-on-primary shadow-xs">
                                  {r.unreadCount}
                                </span>
                              )}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {filteredContacts.length > 0 && (
                  <div>
                    <div className="px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant bg-surface-container-low/70 border-b border-outline-variant/10">
                      Members & Contacts ({filteredContacts.length})
                    </div>
                    {filteredContacts.map((c) => (
                      <button
                        key={c.memberId}
                        onClick={() => {
                          setSearch('');
                          void startDirect(c.memberId);
                        }}
                        className="flex w-full items-center gap-3 border-b border-outline-variant/10 px-3.5 py-2.5 text-left transition-all hover:bg-surface-container-low"
                      >
                        <Avatar
                          name={c.name}
                          photoUrl={c.photoUrl}
                          online={socket.online.has(c.memberId)}
                          size={40}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-bold text-on-surface">{c.name}</span>
                            <span className="shrink-0 text-[10px] font-semibold text-primary px-2 py-0.5 rounded-full bg-primary/10">
                              Chat
                            </span>
                          </div>
                          <p className="truncate text-xs text-on-surface-variant">
                            {[c.roleInUnit, c.subTeam].filter(Boolean).join(' · ') || 'Member'}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          ) : (
            /* Regular Filtered Rooms */
            filteredRooms.length === 0 ? (
              roomFilter === 'DIRECT' ? (
                <div className="p-6 text-center text-xs text-on-surface-variant space-y-3">
                  <div className="w-12 h-12 rounded-full bg-surface-container mx-auto flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-2xl">person</span>
                  </div>
                  <div>
                    <p className="font-bold text-on-surface text-sm">No direct chats yet</p>
                    <p className="text-[11px] text-on-surface-variant mt-0.5">
                      Search for any member above or start a direct conversation.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowContacts(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-on-primary shadow-sm hover:opacity-90 transition-opacity"
                  >
                    <span className="material-symbols-outlined text-sm">edit_square</span>
                    <span>New Direct Message</span>
                  </button>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-on-surface-variant space-y-1">
                  <span className="material-symbols-outlined text-3xl opacity-50">forum</span>
                  <p className="font-semibold">No conversations found</p>
                </div>
              )
            ) : (
              filteredRooms.map((r) => {
                const isDirect = r.type === 'DIRECT';
                const presenceOnline = isDirect && r.direct ? socket.online.has(r.direct.memberId) : undefined;
                const isTyping = roomTyping[r.id];

                return (
                  <button
                    key={r.id}
                    onClick={() => openRoom(r.id)}
                    className={`flex w-full items-center gap-3 border-b border-outline-variant/10 px-3.5 py-3 text-left transition-all ${
                      r.id === activeId
                        ? 'bg-surface-container border-l-4 border-l-primary'
                        : 'hover:bg-surface-container-low'
                    }`}
                  >
                    <Avatar
                      name={r.name}
                      photoUrl={isDirect ? r.direct?.photoUrl : r.imageUrl}
                      icon={isDirect ? undefined : roomIcon(r)}
                      online={presenceOnline}
                      size={42}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-bold text-on-surface">{r.name}</span>
                        {r.lastMessage && (
                          <span className="shrink-0 text-[10px] font-medium text-on-surface-variant">
                            {new Date(r.lastMessage.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center justify-between gap-2 mt-0.5">
                        {isTyping ? (
                          <span className="truncate text-xs font-bold text-emerald-500 animate-pulse flex items-center gap-1">
                            <span>typing…</span>
                          </span>
                        ) : (
                          <span className="truncate text-xs text-on-surface-variant">
                            {r.lastMessage
                              ? `${r.lastMessage.type !== 'TEXT' && r.lastMessage.type !== 'SYSTEM' ? '📎 ' : ''}${
                                  r.lastMessage.deletedAt ? 'Message deleted' : r.lastMessage.body || 'Attachment'
                                }`
                              : r.description || 'No messages yet'}
                          </span>
                        )}
                        {r.unreadCount > 0 && (
                          <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-on-primary shadow-xs">
                            {r.unreadCount}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })
            )
          )}
        </div>
      </aside>

      {/* Main Conversation Thread */}
      <section className={`flex flex-1 flex-col ${mobileThread ? 'flex' : 'hidden sm:flex'}`}>
        {!activeRoom ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-on-surface-variant p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-4xl">chat</span>
            </div>
            <h3 className="text-base font-bold text-on-surface">TFHC Communications Engine</h3>
            <p className="text-xs text-on-surface-variant max-w-sm">
              Select a channel or direct message from the sidebar to start collaborating in real-time.
            </p>
          </div>
        ) : (
          <>
            {/* Thread Header (WhatsApp Style) */}
            <header className="flex items-center gap-3 border-b border-outline-variant/20 bg-surface-container-lowest px-4 py-2.5 shrink-0">
              <button
                onClick={() => setMobileThread(false)}
                className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container sm:hidden"
                aria-label="Back"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              </button>

              <button
                type="button"
                onClick={() => setShowRoomInfo((v) => !v)}
                className="flex items-center gap-3 min-w-0 flex-1 text-left group hover:opacity-90 transition-opacity"
              >
                <Avatar
                  name={activeRoom.name}
                  photoUrl={activeRoom.type === 'DIRECT' ? activeRoom.direct?.photoUrl : activeRoom.imageUrl}
                  icon={activeRoom.type === 'DIRECT' ? undefined : roomIcon(activeRoom)}
                  size={38}
                  online={isDirectOnline}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-on-surface group-hover:text-primary transition-colors">
                    {activeRoom.name}
                  </p>
                  {typingNames.length > 0 ? (
                    <p className="truncate text-xs font-bold text-emerald-500 animate-pulse flex items-center gap-1">
                      <span>{typingNames.join(', ')} {typingNames.length === 1 ? 'is typing…' : 'are typing…'}</span>
                    </p>
                  ) : activeRoom.type === 'DIRECT' ? (
                    <p className={`truncate text-xs flex items-center gap-1 ${isDirectOnline ? 'font-bold text-emerald-500' : 'text-on-surface-variant'}`}>
                      {isDirectOnline ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                          <span>Online</span>
                        </>
                      ) : (
                        <span>Offline</span>
                      )}
                    </p>
                  ) : (
                    <p className="truncate text-xs text-on-surface-variant">
                      {activeRoom.memberCount} member{activeRoom.memberCount === 1 ? '' : 's'}
                    </p>
                  )}
                </div>
              </button>

              {/* Action Buttons */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowInChatSearch((v) => !v)}
                  className={`p-2 rounded-xl transition-colors ${
                    showInChatSearch
                      ? 'bg-primary/10 text-primary'
                      : 'text-on-surface-variant hover:bg-surface-container'
                  }`}
                  title="Search in conversation"
                >
                  <span className="material-symbols-outlined text-[20px]">search</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowRoomInfo((v) => !v)}
                  className={`p-2 rounded-xl transition-colors ${
                    showRoomInfo
                      ? 'bg-primary/10 text-primary'
                      : 'text-on-surface-variant hover:bg-surface-container'
                  }`}
                  title="Channel & member info"
                >
                  <span className="material-symbols-outlined text-[20px]">info</span>
                </button>

                {activeRoom.type === 'CUSTOM' && (
                  <button
                    onClick={() => setShowManage(true)}
                    className="rounded-xl p-2 text-on-surface-variant hover:bg-surface-container"
                    aria-label="Room settings"
                    title="Manage Members"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {canManageRoom ? 'manage_accounts' : 'group'}
                    </span>
                  </button>
                )}
              </div>
            </header>

            {/* In-Chat Search Bar */}
            {showInChatSearch && (
              <div className="p-2.5 border-b border-outline-variant/20 bg-surface-container-low flex items-center gap-2 animate-in slide-in-from-top-2">
                <span className="material-symbols-outlined text-sm text-on-surface-variant">search</span>
                <input
                  type="text"
                  placeholder="Search messages in this conversation…"
                  value={inChatSearch}
                  onChange={(e) => setInChatSearch(e.target.value)}
                  className="flex-1 bg-surface-container-lowest px-3 py-1.5 rounded-xl border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary"
                  autoFocus
                />
                {inChatSearch && (
                  <button
                    onClick={() => setInChatSearch('')}
                    className="text-on-surface-variant hover:text-on-surface"
                  >
                    <span className="material-symbols-outlined text-xs">close</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowInChatSearch(false);
                    setInChatSearch('');
                  }}
                  className="px-2.5 py-1 text-xs font-bold text-on-surface-variant hover:bg-surface-container rounded-lg"
                >
                  Done
                </button>
              </div>
            )}

            {/* Message Stream Area */}
            <div className="relative flex-1 flex overflow-hidden">
              <div
                ref={scrollRef}
                className="flex-1 space-y-1 overflow-y-auto bg-surface-container-low px-4 py-4"
              >
                {nextCursor && (
                  <div className="flex justify-center py-2">
                    <button
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="rounded-full bg-surface-container px-3 py-1 text-xs font-medium text-on-surface-variant hover:bg-surface-container-high"
                    >
                      {loadingMore ? 'Loading…' : 'Load earlier messages'}
                    </button>
                  </div>
                )}

                {loadingRoom ? (
                  <div className="py-16 text-center text-xs text-on-surface-variant space-y-2">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                    <p>Loading conversation messages…</p>
                  </div>
                ) : displayedMessages.length === 0 ? (
                  <div className="py-16 text-center text-xs text-on-surface-variant space-y-2">
                    <span className="material-symbols-outlined text-4xl opacity-40">waving_hand</span>
                    <p className="font-semibold">No messages yet — say hello 👋</p>
                  </div>
                ) : (
                  grouped.map((group) => (
                    <div key={group.day}>
                      <SystemLine text={group.day} />
                      {group.items.map((m, i) => {
                        if (m.type === 'SYSTEM') return <SystemLine key={m.id} text={m.body ?? ''} />;
                        const prev = group.items[i - 1];
                        const showSender =
                          !prev || prev.type === 'SYSTEM' || prev.sender?.memberId !== m.sender?.memberId || prev.mine !== m.mine;
                        return (
                          <div key={m.id} className="py-0.5">
                            <MessageBubble
                              message={m}
                              showSender={showSender}
                              canModerate={canModerate}
                              onReply={setReplyTo}
                              onEdit={(msg) => {
                                setEditing(msg);
                                setReplyTo(null);
                              }}
                              onDelete={handleDelete}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}

                {/* WhatsApp Bouncing 3-Dot Typing Bubble */}
                {typingNames.length > 0 && (
                  <div className="flex items-center gap-2 py-1.5 animate-in fade-in slide-in-from-bottom-2">
                    <div className="rounded-2xl rounded-tl-xs bg-surface-container-lowest border border-outline-variant/20 px-3.5 py-2 shadow-sm flex items-center gap-2">
                      <span className="text-xs font-bold text-emerald-500">
                        {typingNames.join(', ')} {typingNames.length === 1 ? 'is typing' : 'are typing'}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-[bounce_1.4s_infinite_0ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-[bounce_1.4s_infinite_200ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-[bounce_1.4s_infinite_400ms]" />
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Side Drawer: Room & Contact Info */}
              {showRoomInfo && (
                <div className="w-72 sm:w-80 border-l border-outline-variant/20 bg-surface-container-lowest overflow-y-auto p-4 space-y-4 animate-in slide-in-from-right-4 duration-200">
                  <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                    <h4 className="text-sm font-black text-on-surface">Conversation Info</h4>
                    <button
                      onClick={() => setShowRoomInfo(false)}
                      className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>

                  <div className="text-center space-y-2 py-2">
                    <Avatar
                      name={activeRoom.name}
                      photoUrl={activeRoom.type === 'DIRECT' ? activeRoom.direct?.photoUrl : activeRoom.imageUrl}
                      icon={activeRoom.type === 'DIRECT' ? undefined : roomIcon(activeRoom)}
                      size={64}
                      online={isDirectOnline}
                    />
                    <h3 className="text-base font-bold text-on-surface">{activeRoom.name}</h3>
                    <p className="text-xs text-on-surface-variant">{activeRoom.description || 'No description provided'}</p>
                  </div>

                  {activeRoom.type !== 'DIRECT' && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-on-surface uppercase tracking-wider">
                          Members ({roomMembers.length || activeRoom.memberCount})
                        </span>
                      </div>
                      {loadingMembers ? (
                        <p className="text-xs text-on-surface-variant">Loading members…</p>
                      ) : (
                        <div className="space-y-1.5">
                          {roomMembers.map((member) => {
                            const isOnline = socket.online.has(member.memberId);
                            return (
                              <div
                                key={member.memberId}
                                className="flex items-center justify-between p-2 rounded-xl bg-surface-container-low hover:bg-surface-container transition-colors"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <Avatar
                                    name={member.name}
                                    photoUrl={member.photoUrl}
                                    size={30}
                                    online={isOnline}
                                  />
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-bold text-on-surface">{member.name}</p>
                                    <p className="text-[10px] text-on-surface-variant">
                                      {isOnline ? 'Online' : member.role || 'Member'}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => startDirect(member.memberId)}
                                  className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                                  title="Send direct message"
                                >
                                  <span className="material-symbols-outlined text-[16px]">chat</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* File Upload Progress */}
            {upload.view}

            {/* Composer Input Area */}
            <Composer
              draftKey={activeId ? `chat:${activeId}` : undefined}
              disabled={!activeRoom.isActive}
              replyTo={replyTo}
              editing={editing}
              onCancelReply={() => setReplyTo(null)}
              onCancelEdit={() => setEditing(null)}
              onSend={handleSendText}
              onAttach={handleAttach}
              onTyping={(t) => activeId && socket.sendTyping(activeId, t)}
            />
          </>
        )}
      </section>

      {/* Modals */}
      <ContactPickerModal
        open={showContacts}
        onClose={() => setShowContacts(false)}
        onPicked={startDirect}
        online={socket.online}
      />
      <NewRoomModal
        open={showNewRoom}
        onClose={() => setShowNewRoom(false)}
        onCreated={(id) => {
          void loadRooms().then(() => openRoom(id));
        }}
      />
      {activeRoom && activeRoom.type === 'CUSTOM' && (
        <ManageMembersModal
          open={showManage}
          onClose={() => setShowManage(false)}
          roomId={activeRoom.id}
          online={socket.online}
          onChanged={loadRooms}
        />
      )}
    </div>
  );
}
