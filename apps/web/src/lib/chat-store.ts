'use client';

import type { ChatMessage, ChatRoom } from './chat';
import { getAuthToken } from './api';

const ROOMS_CACHE_KEY = 'tfhc_cached_rooms_v3_';
const MSGS_CACHE_PREFIX = 'tfhc_cached_msgs_v3_';
const MAX_CACHED_MESSAGES_PER_ROOM = 100;

// In-memory hot mirror for synchronous zero-latency lookups
let inMemoryRooms: ChatRoom[] | null = null;
const inMemoryMessages = new Map<string, ChatMessage[]>();
const inMemoryCursors = new Map<string, string>();

// Never render a previous account's private conversations on a shared device.
let currentOwner = '';
function owner(): string {
  let next = '';
  try {
    const token = getAuthToken();
    if (token) next = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || '';
  } catch { /* A missing session cannot read private caches. */ }
  if (next !== currentOwner) {
    inMemoryRooms = null;
    inMemoryMessages.clear();
    inMemoryCursors.clear();
    currentOwner = next;
  }
  return next;
}

export function mergeChatMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const messages = new Map(existing.map(m => [m.id, m]));
  for (const message of incoming) {
    if (message.clientId && message.clientId !== message.id) messages.delete(message.clientId);
    const previous = messages.get(message.id);
    const revision = (m: ChatMessage) => Math.max(Date.parse(m.editedAt || '') || 0, Date.parse(m.deletedAt || '') || 0);
    if (previous && revision(previous) > revision(message)) continue;
    messages.set(message.id, previous ? { ...message, readBy: Math.max(previous.readBy || 0, message.readBy || 0), deliveredTo: Math.max(previous.deliveredTo || 0, message.deliveredTo || 0) } : message);
  }
  const confirmed = new Set([...messages.values()].filter(m => !m.pending && !m.failed).map(m => m.clientId).filter(Boolean));
  return [...messages.values()].filter(m => !(m.pending || m.failed) || !confirmed.has(m.clientId || m.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/**
 * Returns locally cached chat rooms immediately for instantaneous initial render.
 */
export function getLocalCachedRooms(): ChatRoom[] {
  const account = owner();
  if (!account) return [];
  if (inMemoryRooms && inMemoryRooms.length > 0) {
    return inMemoryRooms;
  }
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ROOMS_CACHE_KEY + account);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      inMemoryRooms = parsed;
      return parsed;
    }
  } catch {
    // Ignore JSON or storage errors
  }
  return [];
}

/**
 * Persists room list to local cache and hot memory mirror.
 */
export function saveLocalCachedRooms(rooms: ChatRoom[]): void {
  const account = owner();
  if (!account) return;
  inMemoryRooms = rooms;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ROOMS_CACHE_KEY + account, JSON.stringify(rooms));
  } catch {
    // Ignore quota errors
  }
}

/**
 * Returns locally cached messages for a given room for instantaneous thread opening.
 */
export function getLocalCachedMessages(roomId: string): ChatMessage[] {
  const account = owner();
  if (!account) return [];
  if (inMemoryMessages.has(roomId)) {
    return inMemoryMessages.get(roomId)!;
  }
  if (typeof window === 'undefined' || !roomId) return [];
  try {
    const raw = localStorage.getItem(MSGS_CACHE_PREFIX + account + '_' + roomId);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const messages = Array.isArray(parsed) ? parsed : parsed.messages;
    if (Array.isArray(messages)) {
      inMemoryMessages.set(roomId, messages);
      if (typeof parsed.syncCursor === 'string') inMemoryCursors.set(roomId, parsed.syncCursor);
      return messages;
    }
  } catch {
    // Ignore errors
  }
  return [];
}

/**
 * Saves messages for a given room, capping to the latest 100 messages for storage efficiency.
 */
export function saveLocalCachedMessages(roomId: string, messages: ChatMessage[], syncCursor?: string): void {
  const account = owner();
  if (!account) return;
  if (!roomId) return;
  if (syncCursor !== undefined) inMemoryCursors.set(roomId, syncCursor);
  const trimmed = messages.slice(-MAX_CACHED_MESSAGES_PER_ROOM);
  const serialize = (items: ChatMessage[]) => JSON.stringify({ messages: items, syncCursor: inMemoryCursors.get(roomId) });
  inMemoryMessages.set(roomId, trimmed);
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MSGS_CACHE_PREFIX + account + '_' + roomId, serialize(trimmed));
  } catch {
    // Storage quota fallback: evict older room caches if necessary
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(MSGS_CACHE_PREFIX) && key !== MSGS_CACHE_PREFIX + account + '_' + roomId) {
          localStorage.removeItem(key);
          break;
        }
      }
      localStorage.setItem(MSGS_CACHE_PREFIX + account + '_' + roomId, serialize(trimmed.slice(-30)));
    } catch {
      // Ignore
    }
  }
}

/**
 * Updates or appends a single message into the local cache.
 */
export function getLocalSyncCursor(roomId: string): string | undefined {
  getLocalCachedMessages(roomId);
  return inMemoryCursors.get(roomId);
}

export function appendLocalCachedMessage(roomId: string, message: ChatMessage): void {
  const existing = getLocalCachedMessages(roomId);
  const remaining = existing.filter((m) => m.id !== message.id && (!message.clientId || m.id !== message.clientId));
  const updated = mergeChatMessages(remaining, [message]);
  saveLocalCachedMessages(roomId, updated);
}
