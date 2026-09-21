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
  clientId?: string | null;
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
  failed?: boolean;
  readBy?: number;
  deliveredTo?: number;
  reactions?: Record<string, number>;
  myReactions?: string[];
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
  subTeam: string | null;
  joinedAt: string | null;
}

export const chatApi = {
  forward: (id: string, roomId: string, clientId: string) => fetchApi<ChatMessage>(`/chat/messages/${id}/forward`, { method: 'POST', body: JSON.stringify({ roomId, clientId }) }),
  rooms: () => fetchApi<ChatRoom[]>('/chat/rooms'),
  room: (id: string) => fetchApi<ChatRoom>(`/chat/rooms/${id}`),
  messages: (id: string, cursor?: string, limit = 30, search?: string) =>
    fetchApi<{ messages: ChatMessage[]; nextCursor: string | null; hasMore: boolean }>(
      `/chat/rooms/${id}/messages?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`,
    ),
  send: (id: string, body: { body?: string; replyToId?: string; clientId?: string }) =>
    fetchApi<ChatMessage>(`/chat/rooms/${id}/messages`, { method: 'POST', body: JSON.stringify(body) }),
  attach: (id: string, form: FormData) =>
    fetchApi<ChatMessage>(`/chat/rooms/${id}/attachments`, { method: 'POST', body: form }),
  markRead: (id: string, messageId?: string) =>
    fetchApi<{ roomId: string; lastReadAt: string }>(`/chat/rooms/${id}/read`, {
      method: 'POST',
      body: JSON.stringify({ messageId }),
    }),
  react: (id: string, emoji: string, remove: boolean) => fetchApi(`/chat/messages/${id}/reactions`, { method: 'POST', body: JSON.stringify({ emoji, remove }) }),
  hide: (id: string) => fetchApi(`/chat/messages/${id}/hide`, { method: 'POST' }),
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
  onDelivered?: (e: { roomId: string; memberId: string; lastDeliveredAt: string }) => void;
  onReactions?: (e: { messageId: string; reactions: { memberId: string; emoji: string }[] }) => void;
  onPresence?: (e: { memberId: string; online: boolean }) => void;
  onUnread?: () => void;
  onReady?: (e: { memberId: string; rooms: string[]; online: string[] }) => void;
}

let sharedSocket: Socket | null = null;
let socketUsers = 0;
let lastReady: { memberId: string; rooms: string[]; online: string[] } | null = null;

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

    const firstSocket = !sharedSocket;
    const socket = sharedSocket || (sharedSocket = io(`${API_BASE_URL}/chat`, {
      transports: ['websocket', 'polling'],
      auth: (callback) => callback({ token: getAuthToken() }),
      tryAllTransports: true,
      reconnectionAttempts: Infinity,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      reconnectionDelay: 1000,
    }));
    socketUsers++;
    if (firstSocket) {
      socket.on('message:new', (m: ChatMessage) => socket.emit('message:delivered', { roomId: m.roomId, messageId: m.id }));
      socket.on('notification:new', () => window.dispatchEvent(new Event('tfhc:notifications-synced')));
      socket.on('unread:update', () => {
        window.dispatchEvent(new Event('tfhc:unread-update'));
        window.dispatchEvent(new Event('tfhc:notifications-synced'));
      });
    }
    const listeners: Array<[string, (...args: any[]) => void]> = [];
    const on = (event: string, callback: (...args: any[]) => void) => {
      listeners.push([event, callback]);
      socket.on(event, callback);
    };
    setConnected(socket.connected);
    if (socket.connected && lastReady) {
      setOnline(new Set(lastReady.online));
      handlers.current.onReady?.(lastReady);
    }
    socketRef.current = socket;
    const resume = () => {
      if (navigator.onLine && document.visibilityState === 'visible' && !socket.connected) {
        const currentToken = getAuthToken();
        if (currentToken) {
          socket.auth = { token: currentToken };
          socket.connect();
        }
      }
    };
    const signedOut = () => {
      socket.disconnect();
      setConnected(false);
      setOnline(new Set());
    };
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('tfhc:logout', signedOut);

    on('connect', () => setConnected(true));
    on('disconnect', () => setConnected(false));
    on('ready', (e: { memberId: string; rooms: string[]; online: string[] }) => {
      lastReady = e;
      setOnline(new Set(e.online ?? []));
      handlers.current.onReady?.(e);
    });
    on('message:new', (m: ChatMessage) => {
      handlers.current.onMessage?.(m);
    });
    on('message:delivered', e => handlers.current.onDelivered?.(e));
    on('message:reactions', e => handlers.current.onReactions?.(e));
    on('message:update', (m: ChatMessage) => handlers.current.onMessageUpdate?.({ ...m, mine: m.sender?.memberId === lastReady?.memberId }));
    on('message:typing', (e: { roomId: string; memberId: string; name: string; typing: boolean }) =>
      handlers.current.onTyping?.(e),
    );
    on('unread:update', () => handlers.current.onUnread?.());
    on('message:read', (e: { roomId: string; memberId: string; lastReadAt: string }) =>
      handlers.current.onRead?.(e),
    );
    on('presence:update', (e: { memberId: string; online: boolean }) => {
      setOnline((prev) => {
        const next = new Set(prev);
        if (e.online) next.add(e.memberId);
        else next.delete(e.memberId);
        return next;
      });
      handlers.current.onPresence?.(e);
    });

    return () => {
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('tfhc:logout', signedOut);
      listeners.forEach(([event, callback]) => socket.off(event, callback));
      socketUsers--;
      if (!socketUsers) {
        socket.disconnect();
        socket.removeAllListeners();
        sharedSocket = null;
        lastReady = null;
      }
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

  const sendMessage = useCallback(
    (payload: {
      roomId: string;
      body?: string;
      replyToId?: string;
      clientId?: string;
      attachmentUrl?: string;
      type?: string;
    }): Promise<ChatMessage> => {
      const socket = socketRef.current;
      if (socket && socket.connected) {
        return new Promise<ChatMessage>((resolve, reject) => {
          socket.timeout(10000).emit(
            'message:send', payload,
            (error: Error | null, res: { ok: boolean; message?: ChatMessage; error?: string }) => {
              if (error) {
                // Both transports use the same operation key, so retrying a lost
                // acknowledgement cannot insert another message.
                chatApi.send(payload.roomId, payload).then(resolve, reject);
              } else if (res?.ok && res.message) resolve(res.message);
              else reject(new Error(res?.error || 'Message could not be sent'));
            },
          );
        });
      }
      // Fallback to REST API if WebSocket is temporarily disconnected
      return chatApi.send(payload.roomId, {
        body: payload.body,
        replyToId: payload.replyToId,
        clientId: payload.clientId,
      });
    },
    [],
  );

  return useMemo(
    () => ({ connected, online, subscribe, sendTyping, sendRead, sendMessage, socket: sharedSocket }),
    [connected, online, subscribe, sendTyping, sendRead, sendMessage],
  );
}

export function getSharedSocket(): Socket | null {
  return sharedSocket;
}

/** Realtime unread badges with a quiet disconnected fallback. */
export function useChatUnread(): number {
  const [total, setTotal] = useState(0);
  const refreshRef = useRef<() => void>(() => undefined);
  const { connected } = useChatSocket({
    onMessage: () => refreshRef.current(),
    onReady: () => refreshRef.current(),
    onUnread: () => refreshRef.current(),
  });
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (!getAuthToken() || !navigator.onLine) return;
      chatApi
        .unread()
        .then((r) => alive && setTotal(r.total))
        .catch(() => undefined);
    };
    refreshRef.current = refresh;
    refresh();
    const timer = setInterval(() => { if (!connected) refresh(); }, 60000);
    window.addEventListener('tfhc:chat-read', refresh);
    window.addEventListener('tfhc:unread-update', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('tfhc:unread-update', refresh);
      window.removeEventListener('tfhc:chat-read', refresh);
    };
  }, [connected]);
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
  return (
    d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ` ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  );
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
