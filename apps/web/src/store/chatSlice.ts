'use client';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ChatMessage, ChatRoom } from '../lib/chat';

export interface PresenceInfo {
  online: boolean;
  lastSeen?: string;
}

export interface TypingIndicator {
  memberId: string;
  name: string;
}

export interface ChatState {
  rooms: Record<string, ChatRoom>;
  roomOrder: string[];
  messages: Record<string, ChatMessage[]>;
  nextCursors: Record<string, string | null>;
  activeRoomId: string | null;
  presence: Record<string, PresenceInfo>;
  typing: Record<string, TypingIndicator[]>;
  unreadCounts: {
    total: number;
    rooms: Record<string, number>;
  };
  syncCursors: Record<string, string>;
  loadingRooms: boolean;
  loadingMessages: Record<string, boolean>;
}

const initialState: ChatState = {
  rooms: {},
  roomOrder: [],
  messages: {},
  nextCursors: {},
  activeRoomId: null,
  presence: {},
  typing: {},
  unreadCounts: { total: 0, rooms: {} },
  syncCursors: {},
  loadingRooms: false,
  loadingMessages: {},
};

export const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setLoadingRooms(state, action: PayloadAction<boolean>) {
      state.loadingRooms = action.payload;
    },
    setLoadingMessages(state, action: PayloadAction<{ roomId: string; loading: boolean }>) {
      state.loadingMessages[action.payload.roomId] = action.payload.loading;
    },
    setRooms(state, action: PayloadAction<ChatRoom[]>) {
      const roomMap: Record<string, ChatRoom> = {};
      const order: string[] = [];
      for (const r of action.payload) {
        roomMap[r.id] = r;
        order.push(r.id);
      }
      state.rooms = roomMap;
      state.roomOrder = order;

      // Calculate total unread
      let totalUnread = 0;
      const unreadByRoom: Record<string, number> = {};
      for (const r of action.payload) {
        unreadByRoom[r.id] = r.unreadCount || 0;
        totalUnread += r.unreadCount || 0;
      }
      state.unreadCounts = { total: totalUnread, rooms: unreadByRoom };
    },
    upsertRoom(state, action: PayloadAction<ChatRoom>) {
      const room = action.payload;
      state.rooms[room.id] = room;
      if (!state.roomOrder.includes(room.id)) {
        state.roomOrder.unshift(room.id);
      }
    },
    setActiveRoomId(state, action: PayloadAction<string | null>) {
      state.activeRoomId = action.payload;
      if (action.payload && state.rooms[action.payload]) {
        // Clear unread count for active room locally
        const prevCount = state.unreadCounts.rooms[action.payload] || 0;
        state.unreadCounts.rooms[action.payload] = 0;
        state.unreadCounts.total = Math.max(0, state.unreadCounts.total - prevCount);
        if (state.rooms[action.payload]) {
          state.rooms[action.payload].unreadCount = 0;
        }
      }
    },
    setMessages(state, action: PayloadAction<{ roomId: string; messages: ChatMessage[]; nextCursor?: string | null }>) {
      const { roomId, messages, nextCursor } = action.payload;
      state.messages[roomId] = messages;
      if (nextCursor !== undefined) {
        state.nextCursors[roomId] = nextCursor;
      }
    },
    prependMessages(state, action: PayloadAction<{ roomId: string; messages: ChatMessage[]; nextCursor?: string | null }>) {
      const { roomId, messages, nextCursor } = action.payload;
      const existing = state.messages[roomId] || [];
      const existingIds = new Set(existing.map((m) => m.id));
      const filtered = messages.filter((m) => !existingIds.has(m.id));
      state.messages[roomId] = [...filtered, ...existing];
      if (nextCursor !== undefined) {
        state.nextCursors[roomId] = nextCursor;
      }
    },
    appendOptimisticMessage(state, action: PayloadAction<{ roomId: string; message: ChatMessage }>) {
      const { roomId, message } = action.payload;
      if (!state.messages[roomId]) state.messages[roomId] = [];
      state.messages[roomId].push(message);

      // Update room lastMessage and move to top of room list
      if (state.rooms[roomId]) {
        state.rooms[roomId].lastMessage = message;
      }
      state.roomOrder = [roomId, ...state.roomOrder.filter((id) => id !== roomId)];
    },
    reconcileMessage(state, action: PayloadAction<{ roomId: string; clientId: string; confirmed: ChatMessage }>) {
      const { roomId, clientId, confirmed } = action.payload;
      const list = state.messages[roomId];
      if (!list) return;

      const idx = list.findIndex((m) => m.clientId === clientId || m.id === clientId);
      if (idx !== -1) {
        list[idx] = { ...confirmed, pending: false, failed: false };
      } else {
        // If not found in list, append if not already present by ID
        if (!list.some((m) => m.id === confirmed.id)) {
          list.push(confirmed);
        }
      }

      if (state.rooms[roomId]) {
        state.rooms[roomId].lastMessage = confirmed;
      }
    },
    markMessageFailed(state, action: PayloadAction<{ roomId: string; clientId: string }>) {
      const { roomId, clientId } = action.payload;
      const list = state.messages[roomId];
      if (!list) return;
      const msg = list.find((m) => m.clientId === clientId || m.id === clientId);
      if (msg) {
        msg.pending = false;
        msg.failed = true;
      }
    },
    incomingMessage(state, action: PayloadAction<ChatMessage>) {
      const msg = action.payload;
      const roomId = msg.roomId;
      if (!state.messages[roomId]) state.messages[roomId] = [];

      // Deduplicate by id or clientId
      const existingIdx = state.messages[roomId].findIndex(
        (m) => m.id === msg.id || (msg.clientId && m.clientId === msg.clientId),
      );

      if (existingIdx !== -1) {
        state.messages[roomId][existingIdx] = { ...msg, pending: false, failed: false };
      } else {
        state.messages[roomId].push(msg);
      }

      // Bump unread if not the currently active room and not my own message
      if (state.activeRoomId !== roomId && !msg.mine) {
        const cur = state.unreadCounts.rooms[roomId] || 0;
        state.unreadCounts.rooms[roomId] = cur + 1;
        state.unreadCounts.total += 1;
        if (state.rooms[roomId]) {
          state.rooms[roomId].unreadCount = (state.rooms[roomId].unreadCount || 0) + 1;
        }
      }

      // Update room lastMessage and bump to top
      if (state.rooms[roomId]) {
        state.rooms[roomId].lastMessage = msg;
      }
      state.roomOrder = [roomId, ...state.roomOrder.filter((id) => id !== roomId)];
    },
    updateReceiptDelivered(state, action: PayloadAction<{ roomId: string; messageId: string; memberId: string; lastDeliveredAt: string }>) {
      const { roomId, messageId, lastDeliveredAt } = action.payload;
      const list = state.messages[roomId];
      if (!list) return;

      // Mark message and earlier messages delivered
      for (const m of list) {
        if (m.mine && (!m.deliveredTo || m.deliveredTo < 1)) {
          if (m.id === messageId || new Date(m.createdAt) <= new Date(lastDeliveredAt)) {
            m.deliveredTo = (m.deliveredTo || 0) + 1;
          }
        }
      }
    },
    updateReceiptRead(state, action: PayloadAction<{ roomId: string; memberId: string; lastReadAt: string }>) {
      const { roomId, lastReadAt } = action.payload;
      const list = state.messages[roomId];
      if (!list) return;

      const readDate = new Date(lastReadAt);
      for (const m of list) {
        if (m.mine && (!m.readBy || m.readBy < 1)) {
          if (new Date(m.createdAt) <= readDate) {
            m.readBy = (m.readBy || 0) + 1;
            m.deliveredTo = Math.max(m.deliveredTo || 0, 1);
          }
        }
      }
    },
    setTyping(state, action: PayloadAction<{ roomId: string; memberId: string; name: string; isTyping: boolean }>) {
      const { roomId, memberId, name, isTyping } = action.payload;
      if (!state.typing[roomId]) state.typing[roomId] = [];

      if (isTyping) {
        if (!state.typing[roomId].some((t) => t.memberId === memberId)) {
          state.typing[roomId].push({ memberId, name });
        }
      } else {
        state.typing[roomId] = state.typing[roomId].filter((t) => t.memberId !== memberId);
      }
    },
    setPresence(state, action: PayloadAction<{ memberId: string; online: boolean; lastSeen?: string }>) {
      const { memberId, online, lastSeen } = action.payload;
      state.presence[memberId] = { online, lastSeen };
    },
    setBulkPresence(state, action: PayloadAction<Record<string, PresenceInfo>>) {
      state.presence = { ...state.presence, ...action.payload };
    },
    setSyncCursor(state, action: PayloadAction<{ roomId: string; cursor: string }>) {
      state.syncCursors[action.payload.roomId] = action.payload.cursor;
    },
  },
});

export const {
  setLoadingRooms,
  setLoadingMessages,
  setRooms,
  upsertRoom,
  setActiveRoomId,
  setMessages,
  prependMessages,
  appendOptimisticMessage,
  reconcileMessage,
  markMessageFailed,
  incomingMessage,
  updateReceiptDelivered,
  updateReceiptRead,
  setTyping,
  setPresence,
  setBulkPresence,
  setSyncCursor,
} = chatSlice.actions;

export default chatSlice.reducer;
