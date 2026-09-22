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
import { queueChatMessage, queuedChatMessages, acknowledgeChatMessage } from '../../lib/chat-outbox';
import { Avatar } from './Avatar';
import { MessageBubble, SystemLine } from './MessageBubble';
import { useUpload } from '../UploadProgress';
import { Composer } from './Composer';
import { ContactPickerModal, ManageMembersModal, NewRoomModal } from './ChatModals';
import { soundFx } from '../../lib/sound-fx';

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
  const [forwarding, setForwarding] = useState<{ message: ChatMessage; clientId: string } | null>(null);
  const [forwardBusy, setForwardBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [roomFilter, setRoomFilter] = useState<'ALL' | 'UNREAD' | 'DIRECT' | 'GROUPS'>('ALL');
  const [inChatSearch, setInChatSearch] = useState('');
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [roomMembers, setRoomMembers] = useState<any[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
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
      if (document.visibilityState !== 'visible') return;
      setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, unreadCount: 0 } : r)));
      chatApi.markRead(roomId, messageId).then(() => window.dispatchEvent(new Event('tfhc:chat-read'))).catch(() => undefined);
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
      try {
        const page = await chatApi.messages(roomId);
        if (activeIdRef.current !== roomId) return;
        setMessages(page.messages);
        setNextCursor(page.nextCursor);
        if (page.messages.length) markRoomRead(roomId, page.messages[page.messages.length - 1].id);
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
    if (activeId) {
      void loadRoomMembers(activeId);
    }
  }, [activeId, loadRoomMembers]);

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
      void loadRooms();
      // Refresh room list unread & latest messages when socket reconnects
      if (!activeIdRef.current) return;
      const current = activeIdRef.current;
      chatApi.messages(current).then((page) => {
        if (activeIdRef.current !== current) return;
        setMessages((previous) => {
          const ids = new Set(page.messages.flatMap(m => [m.id, m.clientId].filter(Boolean)));
          const newest = page.messages[page.messages.length - 1]?.createdAt ?? '';
          return [...page.messages, ...previous.filter(message => !ids.has(message.id) &&
            (message.pending || message.failed || message.createdAt > newest))];
        });
        setNextCursor(page.nextCursor);
      }).catch(() => undefined);
    },
    onMessage: (m) => {
      // Audio notifications for messages
      if (!m.mine && m.sender?.memberId !== user?.memberId) {
        soundFx.unlockAudioContext();
        if (m.roomId === activeIdRef.current) {
          soundFx.playMessageReceive();
        } else {
          soundFx.playNotification();
        }
      }

      if (m.roomId === activeIdRef.current) {
        setMessages((prev) => {
          const remaining = prev.filter(x => x.id !== m.id && (!m.clientId || x.id !== m.clientId));
          return [...remaining, m];
        });
        markRoomRead(m.roomId, m.id);
        scrollToBottom(true);
      }
      setRooms((prev) => {
        const found = prev.find((r) => r.id === m.roomId);
        const bump =
          found && found.lastMessage?.id !== m.id && m.roomId !== activeIdRef.current && !m.mine
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
    onRead: e => {
      if (e.memberId === user?.memberId) return;
      setMessages(previous => previous.map(m => m.mine && m.roomId === e.roomId && m.createdAt <= e.lastReadAt ? { ...m, readBy: Math.max(1, m.readBy || 0) } : m));
    },
    onDelivered: e => {
      if (e.memberId === user?.memberId) return;
      setMessages(previous => previous.map(m => m.mine && m.roomId === e.roomId && m.createdAt <= e.lastDeliveredAt ? { ...m, deliveredTo: Math.max(1, m.deliveredTo || 0) } : m));
    },
    onReactions: e => setMessages(previous => previous.map(m => m.id === e.messageId ? {
      ...m, reactions: e.reactions.reduce((counts, r) => ({ ...counts, [r.emoji]: (counts[r.emoji] || 0) + 1 }), {} as Record<string, number>),
      myReactions: e.reactions.filter(r => r.memberId === user?.memberId).map(r => r.emoji),
    } : m)),
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

  const mergeSaved = useCallback((tempId: string, saved: ChatMessage) =>
    setMessages((prev) => {
      const next = prev.filter((m) => m.id !== tempId && (!saved.clientId || m.id !== saved.clientId));
      return next.some((m) => m.id === saved.id) ? next : [...next, saved];
    }), []);

  const draining = useRef(false);
  const drainOutbox = useCallback(async () => {
    if (draining.current || !navigator.onLine) return;
    draining.current = true;
    try {
      for (const item of await queuedChatMessages()) {
        try {
          const saved = await chatApi.send(item.roomId, item);
          await acknowledgeChatMessage(item.clientId);
          if (activeIdRef.current === item.roomId) mergeSaved(item.clientId, saved);
        } catch { break; } // Preserve all unacknowledged records, in order.
      }
    } finally { draining.current = false; }
  }, [mergeSaved]);

  useEffect(() => {
    const restore = async () => {
      try {
        const queued = await queuedChatMessages();
        setMessages(previous => [...previous, ...queued.filter(q => q.roomId === activeId && !previous.some(m => m.id === q.clientId || m.clientId === q.clientId)).map(q => ({
          id: q.clientId, clientId: q.clientId, roomId: q.roomId, body: q.body, type: 'TEXT' as const,
          attachmentUrl: null, attachmentMeta: null, replyToId: q.replyToId || null, replyTo: null,
          editedAt: null, deletedAt: null, createdAt: q.createdAt, sender: null, mine: true, failed: true,
        }))]);
        await drainOutbox();
      } catch { /* Do not remove queued data when a session or key is unavailable. */ }
    };
    if (!loadingRoom) void restore();
    const resume = () => { void restore(); };
    window.addEventListener('online', resume);
    return () => window.removeEventListener('online', resume);
  }, [activeId, loadingRoom, socket.connected, drainOutbox]);

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
    const clientId = crypto.randomUUID();
    const tempId = clientId;
    const optimistic: ChatMessage = {
      id: tempId,
      clientId,
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
    // The draft is cleared only after the encrypted queue transaction commits.
    await queueChatMessage({ clientId, roomId, body: text, replyToId: replyTo?.id, createdAt: optimistic.createdAt });
    setMessages((prev) => [...prev, optimistic]);
    scrollToBottom(true);
    const replyId = replyTo?.id;
    setReplyTo(null);
    void socket.sendMessage({ roomId, body: text, replyToId: replyId, clientId }).then(async saved => {
      await acknowledgeChatMessage(clientId);
      if (activeIdRef.current === roomId) mergeSaved(tempId, saved);
    }).catch(() => {
      setMessages((prev) => prev.map(m => m.id === tempId ? { ...m, pending: false, failed: true } : m));
      notify(navigator.onLine ? 'Message saved on this device. Retry to send.' : 'Message queued on this device until you reconnect.', 'info');
    });
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

  useEffect(() => {
    let active = true;
    if (!activeId || !inChatSearch.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(() => {
      chatApi.messages(activeId, undefined, 50, inChatSearch.trim()).then(page => {
        if (active) setSearchResults(page.messages);
      }).catch(() => { if (active) notify('Message search failed.', 'error'); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [activeId, inChatSearch, notify]);
  const displayedMessages = inChatSearch.trim() ? searchResults : messages;

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
      style={bottomInset !== '0rem' ? { height: `calc(100dvh - 4rem - ${bottomInset})` } : undefined}
    >
      {forwarding && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label="Forward message">
          <div className="max-h-[85vh] w-full max-w-md overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 text-slate-900 dark:text-white flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <h2 className="text-base font-extrabold">Forward message to</h2>
              <button onClick={() => setForwarding(null)} className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 py-3">
              {rooms.map((room) => (
                <button
                  key={room.id}
                  disabled={forwardBusy}
                  className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium text-sm disabled:opacity-50"
                  onClick={async () => {
                    setForwardBusy(true);
                    try {
                      const saved = await chatApi.forward(forwarding.message.id, room.id, forwarding.clientId);
                      if (activeIdRef.current === room.id) mergeSaved('', saved);
                      setForwarding(null);
                      notify('Message forwarded.', 'success');
                    } catch {
                      notify('Could not forward the message. Try again.', 'error');
                    } finally {
                      setForwardBusy(false);
                    }
                  }}
                >
                  <span className="material-symbols-outlined text-primary text-xl">forum</span>
                  <span className="truncate flex-1">{room.name}</span>
                </button>
              ))}
            </div>
            <button
              disabled={forwardBusy}
              className="mt-3 w-full rounded-xl py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs shrink-0 active:scale-95 transition-all"
              onClick={() => setForwarding(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
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
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold text-on-surface group-hover:text-primary transition-colors">
                      {activeRoom.name}
                    </p>
                    {activeRoom.type !== 'DIRECT' && (
                      <span className="hidden xs:inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                        <span className="material-symbols-outlined text-[12px]">group</span>
                        <span>{activeRoom.memberCount}</span>
                      </span>
                    )}
                  </div>
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
                    <p className="truncate text-xs text-on-surface-variant flex items-center gap-1.5">
                      <span>{activeRoom.memberCount} members</span>
                      <span className="text-primary font-bold hover:underline cursor-pointer">· View members list</span>
                    </p>
                  )}
                </div>
              </button>

              {/* Action Buttons */}
              <div className="flex items-center gap-1">
                {/* Voice & Video Call Buttons */}
                <button
                  type="button"
                  onClick={() => {
                    if (!activeRoom) return;
                    soundFx.unlockAudioContext();
                    const targetMemberId =
                      activeRoom.type === 'DIRECT'
                        ? activeRoom.direct?.memberId ||
                          roomMembers.find((m) => m.memberId !== user?.memberId)?.memberId
                        : undefined;
                    window.dispatchEvent(
                      new CustomEvent('tfhc:start-call', {
                        detail: {
                          roomId: activeRoom.id,
                          targetMemberId,
                          peerName: activeRoom.name,
                          isVideo: false,
                        },
                      })
                    );
                  }}
                  className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors cursor-pointer"
                  title="Voice Call"
                  aria-label="Voice Call"
                >
                  <span className="material-symbols-outlined text-[20px]">call</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!activeRoom) return;
                    soundFx.unlockAudioContext();
                    const targetMemberId =
                      activeRoom.type === 'DIRECT'
                        ? activeRoom.direct?.memberId ||
                          roomMembers.find((m) => m.memberId !== user?.memberId)?.memberId
                        : undefined;
                    window.dispatchEvent(
                      new CustomEvent('tfhc:start-call', {
                        detail: {
                          roomId: activeRoom.id,
                          targetMemberId,
                          peerName: activeRoom.name,
                          isVideo: true,
                        },
                      })
                    );
                  }}
                  className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors cursor-pointer"
                  title="Video Call"
                  aria-label="Video Call"
                >
                  <span className="material-symbols-outlined text-[20px]">videocam</span>
                </button>

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
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all ${
                    showRoomInfo
                      ? 'bg-primary text-on-primary font-bold shadow-xs'
                      : 'bg-surface-container-low text-on-surface hover:bg-surface-container text-xs font-semibold border border-outline-variant/30'
                  }`}
                  title={activeRoom.type === 'DIRECT' ? 'Direct conversation info' : 'View group members'}
                  aria-label="View group members"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {activeRoom.type === 'DIRECT' ? 'info' : 'groups'}
                  </span>
                  {activeRoom.type !== 'DIRECT' && (
                    <span className="hidden sm:inline text-xs font-bold">Members</span>
                  )}
                </button>

                {activeRoom.type === 'CUSTOM' && (
                  <button
                    onClick={() => setShowManage(true)}
                    className="rounded-xl p-2 text-on-surface-variant hover:bg-surface-container"
                    aria-label="Room settings"
                    title="Manage Members"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {canManageRoom ? 'manage_accounts' : 'person_add'}
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
                        const handleStartCallFromMessage = (isVideo: boolean) => {
                          soundFx.unlockAudioContext();
                          const isCaller = m.mine;
                          const meta = m.attachmentMeta as { targetMemberId?: string } | null;
                          const targetMemberId =
                            activeRoom?.type === 'DIRECT'
                              ? activeRoom.direct?.memberId || roomMembers.find((rm) => rm.memberId !== user?.memberId)?.memberId
                              : isCaller
                              ? meta?.targetMemberId
                              : m.sender?.memberId;

                          window.dispatchEvent(
                            new CustomEvent('tfhc:start-call', {
                              detail: {
                                roomId: activeRoom?.id,
                                targetMemberId,
                                peerName: activeRoom?.name || m.sender?.name || 'Member',
                                isVideo,
                              },
                            })
                          );
                        };

                        if (m.type === 'SYSTEM') {
                          if (m.attachmentMeta?.kind === 'CALL') {
                            return (
                              <div key={m.id} id={`chat-message-${m.id}`} className="py-0.5">
                                <MessageBubble
                                  message={m}
                                  showSender={false}
                                  canModerate={canModerate}
                                  onReply={setReplyTo}
                                  onForward={(message) => setForwarding({ message, clientId: crypto.randomUUID() })}
                                  onJumpToReply={(id) => {
                                    const target = document.getElementById(`chat-message-${id}`);
                                    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    else notify('Load older messages to view the original message.', 'info');
                                  }}
                                  onEdit={(msg) => {
                                    setEditing(msg);
                                    setReplyTo(null);
                                  }}
                                  onDelete={handleDelete}
                                  onRetry={() => { void drainOutbox(); }}
                                  onReact={(message, emoji) => {
                                    void chatApi.react(message.id, emoji, message.myReactions?.includes(emoji) || false).catch(() => notify('Reaction could not be saved.', 'error'));
                                  }}
                                  onHide={(message) => {
                                    void chatApi.hide(message.id).then(() => setMessages((prev) => prev.filter((item) => item.id !== message.id))).catch(() => notify('Message could not be hidden.', 'error'));
                                  }}
                                  onStartCall={handleStartCallFromMessage}
                                />
                              </div>
                            );
                          }
                          return <SystemLine key={m.id} text={m.body ?? ''} />;
                        }

                        const prev = group.items[i - 1];
                        const showSender =
                          !prev || prev.type === 'SYSTEM' || prev.sender?.memberId !== m.sender?.memberId || prev.mine !== m.mine;
                        return (
                          <div key={m.id} id={`chat-message-${m.id}`} className="py-0.5">
                            <MessageBubble
                              message={m}
                              showSender={showSender}
                              canModerate={canModerate}
                              onReply={setReplyTo}
                              onForward={message => setForwarding({ message, clientId: crypto.randomUUID() })}
                              onJumpToReply={id => {
                                const target = document.getElementById(`chat-message-${id}`);
                                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                else notify('Load older messages to view the original message.', 'info');
                              }}
                              onEdit={(msg) => {
                                setEditing(msg);
                                setReplyTo(null);
                              }}
                              onDelete={handleDelete}
                              onRetry={() => { void drainOutbox(); }}
                              onReact={(message, emoji) => { void chatApi.react(message.id, emoji, message.myReactions?.includes(emoji) || false).catch(() => notify('Reaction could not be saved.', 'error')); }}
                              onHide={message => { void chatApi.hide(message.id).then(() => setMessages(prev => prev.filter(item => item.id !== message.id))).catch(() => notify('Message could not be hidden.', 'error')); }}
                              onStartCall={handleStartCallFromMessage}
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

              {/* Side Drawer / Modal: Room & Member Info */}
              {showRoomInfo && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex justify-end sm:static sm:z-auto sm:bg-transparent sm:backdrop-blur-none animate-in fade-in duration-150">
                  <div className="w-full max-w-sm sm:w-80 md:w-88 h-full border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto p-4 space-y-4 animate-in slide-in-from-right duration-200 flex flex-col shadow-2xl sm:shadow-none">
                    <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[20px]">
                          {activeRoom.type === 'DIRECT' ? 'person' : 'groups'}
                        </span>
                        <h4 className="text-sm font-black text-on-surface">
                          {activeRoom.type === 'DIRECT' ? 'Contact Info' : 'Group Members & Info'}
                        </h4>
                      </div>
                      <button
                        onClick={() => setShowRoomInfo(false)}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
                        aria-label="Close"
                      >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                      </button>
                    </div>

                    <div className="text-center space-y-2 py-2 shrink-0 bg-surface-container-low/50 rounded-2xl p-3 border border-outline-variant/10">
                      <Avatar
                        name={activeRoom.name}
                        photoUrl={activeRoom.type === 'DIRECT' ? activeRoom.direct?.photoUrl : activeRoom.imageUrl}
                        icon={activeRoom.type === 'DIRECT' ? undefined : roomIcon(activeRoom)}
                        size={60}
                        online={isDirectOnline}
                      />
                      <div>
                        <h3 className="text-base font-bold text-on-surface">{activeRoom.name}</h3>
                        <p className="text-xs text-on-surface-variant mt-0.5">{activeRoom.description || 'No description provided'}</p>
                      </div>
                      {activeRoom.type !== 'DIRECT' && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
                          <span className="material-symbols-outlined text-sm">groups</span>
                          <span>{roomMembers.length || activeRoom.memberCount} Total Members</span>
                        </div>
                      )}
                    </div>

                    {activeRoom.type !== 'DIRECT' && (
                      <div className="flex-1 flex flex-col min-h-0 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-on-surface uppercase tracking-wider">
                            Members List ({roomMembers.length || activeRoom.memberCount})
                          </span>
                          {activeRoom.type === 'CUSTOM' && canManageRoom && (
                            <button
                              type="button"
                              onClick={() => {
                                setShowRoomInfo(false);
                                setShowManage(true);
                              }}
                              className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-[14px]">person_add</span>
                              <span>Add Members</span>
                            </button>
                          )}
                        </div>

                        {/* Search in Members */}
                        <div className="relative shrink-0">
                          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">search</span>
                          <input
                            type="text"
                            placeholder="Filter members by name, role, unit…"
                            value={memberSearch}
                            onChange={(e) => setMemberSearch(e.target.value)}
                            className="w-full bg-surface-container-low pl-8 pr-8 py-1.5 rounded-xl border border-outline-variant/30 text-xs text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary"
                          />
                          {memberSearch && (
                            <button
                              onClick={() => setMemberSearch('')}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                            >
                              <span className="material-symbols-outlined text-xs">close</span>
                            </button>
                          )}
                        </div>

                        {loadingMembers ? (
                          <div className="py-8 text-center text-xs text-on-surface-variant space-y-2">
                            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                            <p>Loading members list…</p>
                          </div>
                        ) : (
                          <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
                            {roomMembers
                              .filter((m) => {
                                if (!memberSearch.trim()) return true;
                                const q = memberSearch.toLowerCase().trim();
                                return (
                                  (m.name && m.name.toLowerCase().includes(q)) ||
                                  (m.subTeam && m.subTeam.toLowerCase().includes(q)) ||
                                  (m.roleInUnit && m.roleInUnit.toLowerCase().includes(q)) ||
                                  (m.role && m.role.toLowerCase().includes(q))
                                );
                              })
                              .map((member) => {
                                const isOnline = socket.online.has(member.memberId);
                                const isDisciplinary =
                                  (member.subTeam && /disciplinary/i.test(member.subTeam)) ||
                                  (member.roleInUnit && /disciplinary/i.test(member.roleInUnit));
                                const isExec =
                                  (member.subTeam && /executive/i.test(member.subTeam)) ||
                                  (member.roleInUnit && /executive|leader|coordinator|head/i.test(member.roleInUnit)) ||
                                  member.role !== 'MEMBER';

                                return (
                                  <div
                                    key={member.memberId}
                                    className="flex items-center justify-between p-2 rounded-xl bg-surface-container-low hover:bg-surface-container transition-colors border border-outline-variant/10 gap-2"
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                      <Avatar
                                        name={member.name}
                                        photoUrl={member.photoUrl}
                                        size={34}
                                        online={isOnline}
                                      />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <p className="truncate text-xs font-bold text-on-surface">{member.name}</p>
                                          {isDisciplinary && (
                                            <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                              Disciplinary
                                            </span>
                                          )}
                                          {isExec && !isDisciplinary && (
                                            <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                              Executive
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-on-surface-variant truncate">
                                          <span>{member.subTeam || member.roleInUnit || 'Member'}</span>
                                          {isOnline && (
                                            <span className="text-emerald-500 font-bold flex items-center gap-0.5">
                                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                                              <span>Online</span>
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setShowRoomInfo(false);
                                        void startDirect(member.memberId);
                                      }}
                                      className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors shrink-0"
                                      title={`Message ${member.name}`}
                                    >
                                      <span className="material-symbols-outlined text-[18px]">chat</span>
                                    </button>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* File Upload Progress */}
            {upload.view}

            {/* Composer Input Area */}
            <Composer
              draftKey={activeId && user?.memberId ? `chat:${user.memberId}:${activeId}` : undefined}
              disabled={!activeRoom.isActive}
              replyTo={replyTo}
              editing={editing}
              onCancelReply={() => setReplyTo(null)}
              onCancelEdit={() => setEditing(null)}
              onSend={handleSendText}
              onAttach={handleAttach}
              onTyping={(t) => activeId && socket.sendTyping(activeId, t)}
              members={roomMembers}
              isGroup={activeRoom.type !== 'DIRECT'}
              currentMemberId={user?.memberId}
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
