'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useToast } from '../ui';
import {
  ChatMessage,
  ChatRoom,
  chatApi,
  dayLabel,
  useChatSocket,
} from '../../lib/chat';
import { Avatar } from './Avatar';
import { MessageBubble, SystemLine } from './MessageBubble';
import { Composer } from './Composer';
import { ContactPickerModal, ManageMembersModal, NewRoomModal } from './ChatModals';

const ROOM_ICON: Record<string, string> = {
  GENERAL: 'forum',
  EXECUTIVES: 'shield_person',
  CUSTOM: 'groups',
  DIRECT: 'person',
};

function roomIcon(room: ChatRoom): string {
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
  const { can } = useAuth();
  const { notify } = useToast();
  const canManage = can('messages.manage_rooms');
  const canModerate = can('messages.moderate');

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeId, setActiveId] = useState<string | null>(deepLinkRoomId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [typingBy, setTypingBy] = useState<Record<string, string>>({});
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
      // Update the ref synchronously so a message sent before React re-renders
      // still targets the room the user just opened.
      activeIdRef.current = roomId;
      setActiveId(roomId);
      setMobileThread(true);
      setReplyTo(null);
      setEditing(null);
      setLoadingRoom(true);
      setMessages([]);
      try {
        const page = await chatApi.messages(roomId);
        setMessages(page.messages);
        setNextCursor(page.nextCursor);
        socket.subscribe(roomId);
        const last = page.messages[page.messages.length - 1];
        markRoomRead(roomId, last?.id);
        scrollToBottom();
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Could not open the conversation.', 'error');
      } finally {
        setLoadingRoom(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markRoomRead, notify, scrollToBottom],
  );

  const loadMore = useCallback(async () => {
    if (!activeId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const page = await chatApi.messages(activeId, nextCursor);
      setMessages((prev) => [...page.messages, ...prev]);
      setNextCursor(page.nextCursor);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } finally {
      setLoadingMore(false);
    }
  }, [activeId, nextCursor, loadingMore]);

  // --- socket wiring -------------------------------------------------------
  const socket = useChatSocket({
    onReady: () => void loadRooms(),
    onMessage: (m) => {
      if (m.roomId === activeIdRef.current) {
        setMessages((prev) => {
          if (prev.some((x) => x.id === m.id)) return prev;
          // Our own message is still mid-flight as an optimistic bubble; let the
          // REST response swap it in so we don't render it twice.
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
        }, 5000);
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

  // --- actions ------------------------------------------------------------
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
      }
      return;
    }
    const tempId = `tmp-${Date.now()}`;
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
      const saved = await chatApi.send(roomId, { body: text, replyToId: replyId });
      mergeSaved(tempId, saved);
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      notify(e instanceof Error ? e.message : 'Message failed to send.', 'error');
    }
  };

  const handleAttach = async (file: File) => {
    const roomId = activeIdRef.current;
    if (!roomId) return;
    const form = new FormData();
    form.append('file', file);
    if (replyTo) form.append('replyToId', replyTo.id);
    setReplyTo(null);
    try {
      const saved = await chatApi.attach(roomId, form);
      mergeSaved('', saved);
      scrollToBottom(true);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Attachment failed.', 'error');
    }
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

  // --- rendering --------------------------------------------------------
  const filteredRooms = rooms.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
  const totalUnread = rooms.reduce((s, r) => s + r.unreadCount, 0);

  const grouped: { day: string; items: ChatMessage[] }[] = [];
  for (const m of messages) {
    const label = dayLabel(m.createdAt);
    const last = grouped[grouped.length - 1];
    if (last && last.day === label) last.items.push(m);
    else grouped.push({ day: label, items: [m] });
  }

  const typingNames = Object.values(typingBy);
  const canManageRoom =
    !!activeRoom && activeRoom.type === 'CUSTOM' && (canManage || activeRoom.role === 'MODERATOR');

  return (
    <div
      className="mx-auto flex max-w-6xl overflow-hidden border-x border-outline-variant/20 bg-surface-container-low"
      style={{ height: `calc(100vh - 4rem - ${bottomInset})` }}
    >
      {/* Room list */}
      <aside
        className={`flex w-full flex-col border-r border-outline-variant/20 bg-surface-container-lowest sm:w-80 ${
          mobileThread ? 'hidden sm:flex' : 'flex'
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-outline-variant/20 px-4 py-3">
          <h2 className="text-lg font-bold text-on-surface">
            Chat
            {totalUnread > 0 && (
              <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-on-primary">
                {totalUnread}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowContacts(true)}
              className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container"
              aria-label="New message"
            >
              <span className="material-symbols-outlined text-[20px]">edit_square</span>
            </button>
            {canManage && (
              <button
                onClick={() => setShowNewRoom(true)}
                className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container"
                aria-label="New room"
              >
                <span className="material-symbols-outlined text-[20px]">group_add</span>
              </button>
            )}
          </div>
        </div>
        <div className="px-3 py-2">
          <input
            className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:border-primary focus:outline-none"
            placeholder="Search conversations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredRooms.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-on-surface-variant">No conversations yet.</p>
          )}
          {filteredRooms.map((r) => {
            const isDirect = r.type === 'DIRECT';
            const presenceOnline = isDirect && r.direct ? socket.online.has(r.direct.memberId) : undefined;
            return (
              <button
                key={r.id}
                onClick={() => openRoom(r.id)}
                className={`flex w-full items-center gap-3 border-b border-outline-variant/10 px-4 py-3 text-left transition-colors ${
                  r.id === activeId ? 'bg-surface-container' : 'hover:bg-surface-container-low'
                }`}
              >
                <Avatar
                  name={r.name}
                  photoUrl={isDirect ? r.direct?.photoUrl : r.imageUrl}
                  icon={isDirect ? undefined : roomIcon(r)}
                  online={presenceOnline}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-on-surface">{r.name}</span>
                    {r.lastMessage && (
                      <span className="shrink-0 text-[10px] text-on-surface-variant">
                        {new Date(r.lastMessage.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-on-surface-variant">
                      {r.lastMessage
                        ? `${r.lastMessage.type !== 'TEXT' && r.lastMessage.type !== 'SYSTEM' ? '📎 ' : ''}${
                            r.lastMessage.deletedAt ? 'Message deleted' : r.lastMessage.body || 'Attachment'
                          }`
                        : r.description || 'No messages yet'}
                    </span>
                    {r.unreadCount > 0 && (
                      <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-on-primary">
                        {r.unreadCount}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Thread */}
      <section className={`flex flex-1 flex-col ${mobileThread ? 'flex' : 'hidden sm:flex'}`}>
        {!activeRoom ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-on-surface-variant">
            <span className="material-symbols-outlined text-5xl">chat</span>
            <p className="text-sm">Select a conversation to start messaging.</p>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-outline-variant/20 bg-surface-container-lowest px-4 py-3">
              <button
                onClick={() => setMobileThread(false)}
                className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container sm:hidden"
                aria-label="Back"
              >
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
              <Avatar
                name={activeRoom.name}
                photoUrl={activeRoom.type === 'DIRECT' ? activeRoom.direct?.photoUrl : activeRoom.imageUrl}
                icon={activeRoom.type === 'DIRECT' ? undefined : roomIcon(activeRoom)}
                size={36}
                online={
                  activeRoom.type === 'DIRECT' && activeRoom.direct
                    ? socket.online.has(activeRoom.direct.memberId)
                    : undefined
                }
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-on-surface">{activeRoom.name}</p>
                <p className="truncate text-xs text-on-surface-variant">
                  {activeRoom.type === 'DIRECT'
                    ? activeRoom.direct && socket.online.has(activeRoom.direct.memberId)
                      ? 'Online'
                      : 'Direct message'
                    : `${activeRoom.memberCount} member${activeRoom.memberCount === 1 ? '' : 's'}`}
                </p>
              </div>
              {activeRoom.type === 'CUSTOM' && (
                <button
                  onClick={() => setShowManage(true)}
                  className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container"
                  aria-label="Room details"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {canManageRoom ? 'manage_accounts' : 'group'}
                  </span>
                </button>
              )}
            </header>

            <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto bg-surface-container-low px-4 py-4">
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
                <p className="py-10 text-center text-sm text-on-surface-variant">Loading messages…</p>
              ) : messages.length === 0 ? (
                <p className="py-10 text-center text-sm text-on-surface-variant">
                  No messages yet — say hello 👋
                </p>
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
              {typingNames.length > 0 && (
                <p className="px-2 text-xs italic text-on-surface-variant">
                  {typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing…
                </p>
              )}
            </div>

            <Composer
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
