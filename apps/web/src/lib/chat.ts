'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, fetchApi, getAuthToken } from './api';

export interface ChatSender {
  memberId: string;
  name: string;
  photoUrl: string | null;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'SYSTEM';
  body: string | null;
  attachmentUrl: string | null;
  attachmentMeta: Record<string, unknown> | null;
  replyToId: string | null;
  replyTo: { id: string; body: string | null; senderName: string | null } | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  sender: ChatSender | null;
  mine: boolean;
  pending?: boolean;
}

export interface ChatRoom {
  id: string;
  key: string | null;
  type: 'GENERAL' | 'EXECUTIVES' | 'CUSTOM' | 'DIRECT';
  name: string;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  role: 'MEMBER' | 'MODERATOR' | null;
  muted: boolean;
  memberCount: number;
  unreadCount: number;
  lastReadAt: string | null;
  direct: ChatSender | null;
  lastMessage: ChatMessage | null;
}

export interface ChatContact {
  memberId: string;
  name: string;
  photoUrl: string | null;
  roleInUnit: string | null;
  subTeam: string | null;
}

export interface RoomMember {
  memberId: string;
  name: string;
  photoUrl: string | null;
  role: string;
  roleInUnit: string | null;
  joinedAt: string | null;
}

export const chatApi = {
  rooms: () => fetchApi<ChatRoom[]>('/chat/rooms'),
  room: (id: string) => fetchApi<ChatRoom>(`/chat/rooms/${id}`),
  messages: (id: string, cursor?: string, limit = 30) =>
    fetchApi<{ messages: ChatMessage[]; nextCursor: string | null; hasMore: boolean }>(
      `/chat/rooms/${id}/messages?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  send: (id: string, body: { body?: string; replyToId?: string }) =>
    fetchApi<ChatMessage>(`/chat/rooms/${id}/messages`, { method: 'POST', body: JSON.stringify(body) }),
  attach: (id: string, form: FormData) =>
    fetchApi<ChatMessage>(`/chat/rooms/${id}/attachments`, { method: 'POST', body: form }),
  markRead: (id: string, messageId?: string) =>
    fetchApi<{ roomId: string; lastReadAt: string }>(`/chat/rooms/${id}/read`, {
      method: 'POST',
      body: JSON.stringify({ messageId }),
    }),
  edit: (messageId: string, body: string) =>
    fetchApi<ChatMessage>(`/chat/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
  remove: (messageId: string) => fetchApi<ChatMessage>(`/chat/messages/${messageId}`, { method: 'DELETE' }),
  direct: (memberId: string) => fetchApi<ChatRoom>(`/chat/direct/${memberId}`, { method: 'POST' }),
  contacts: () => fetchApi<ChatContact[]>('/chat/contacts'),
  roomMembers: (id: string) => fetchApi<RoomMember[]>(`/chat/rooms/${id}/members`),
  unread: () => fetchApi<{ total: number; rooms: { roomId: string; unreadCount: number }[] }>('/chat/unread'),
  createRoom: (body: { name: string; description?: string; memberIds?: string[] }) =>
    fetchApi<ChatRoom>('/chat/rooms', { method: 'POST', body: JSON.stringify(body) }),
  updateRoom: (id: string, body: Record<string, unknown>) =>
    fetchApi<ChatRoom>(`/chat/rooms/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  addMembers: (id: string, memberIds: string[]) =>
    fetchApi<RoomMember[]>(`/chat/rooms/${id}/members`, { method: 'POST', body: JSON.stringify({ memberIds }) }),
  removeMember: (id: string, memberId: string) =>
    fetchApi<RoomMember[]>(`/chat/rooms/${id}/members/${memberId}`, { method: 'DELETE' }),
  leave: (id: string) => fetchApi<{ left: boolean }>(`/chat/rooms/${id}/leave`, { method: 'POST' }),
};

export interface ChatSocketEvents {
  onMessage?: (m: ChatMessage) => void;
  onMessageUpdate?: (m: ChatMessage) => void;
  onTyping?: (e: { roomId: string; memberId: string; name: string; typing: boolean }) => void;
  onRead?: (e: { roomId: string; memberId: string; lastReadAt: string }) => void;
  onPresence?: (e: { memberId: string; online: boolean }) => void;
  onReady?: (e: { memberId: string; rooms: string[]; online: string[] }) => void;
}

/**
 * Opens a single authenticated `/chat` socket for the lifetime of the caller.
 * Returns helpers plus the live presence set. Handlers are read from a ref so
 * consumers don't need to memoise them.
 */
export function useChatSocket(events: ChatSocketEvents) {
  const handlers = useRef(events);
  handlers.current = events;
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;

    const socket = io(`${API_BASE_URL}/chat`, {
      transports: ['websocket'],
      auth: { token },
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('ready', (e: { memberId: string; rooms: string[]; online: string[] }) => {
      setOnline(new Set(e.online ?? []));
      handlers.current.onReady?.(e);
    });
    socket.on('message:new', (m: ChatMessage) => handlers.current.onMessage?.(m));
    socket.on('message:update', (m: ChatMessage) => handlers.current.onMessageUpdate?.(m));
    socket.on('message:typing', (e: { roomId: string; memberId: string; name: string; typing: boolean }) =>
      handlers.current.onTyping?.(e),
    );
    socket.on('message:read', (e: { roomId: string; memberId: string; lastReadAt: string }) =>
      handlers.current.onRead?.(e),
    );
    socket.on('presence:update', (e: { memberId: string; online: boolean }) => {
      setOnline((prev) => {
        const next = new Set(prev);
        if (e.online) next.add(e.memberId);
        else next.delete(e.memberId);
        return next;
      });
      handlers.current.onPresence?.(e);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const subscribe = useCallback((roomId: string) => {
    socketRef.current?.emit('room:subscribe', { roomId });
  }, []);
  const sendTyping = useCallback((roomId: string, typing: boolean) => {
    socketRef.current?.emit('message:typing', { roomId, typing });
  }, []);
  const sendRead = useCallback((roomId: string, messageId?: string) => {
    socketRef.current?.emit('message:read', { roomId, messageId });
  }, []);

  return useMemo(
    () => ({ connected, online, subscribe, sendTyping, sendRead }),
    [connected, online, subscribe, sendTyping, sendRead],
  );
}

/** Lightweight unread badge source for the nav — polls + refreshes on focus. */
export function useChatUnread(): number {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (!getAuthToken()) return;
      chatApi
        .unread()
        .then((r) => alive && setTotal(r.total))
        .catch(() => undefined);
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return total;
}

export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString())
    return `Yesterday ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ` ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}
