'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchApi, getAuthToken } from './api';

export interface MemberNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  status: 'UNREAD' | 'READ' | 'ARCHIVED';
  createdAt: string;
  data?: Record<string, unknown>;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<MemberNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const isMounted = useRef(true);

  const load = useCallback(async () => {
    if (!getAuthToken()) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    try {
      const data = await fetchApi<MemberNotification[]>('/members/me/notifications');
      if (isMounted.current && Array.isArray(data)) {
        const unread = data.filter((n) => n.status === 'UNREAD').length;
        setNotifications(data);
        setUnreadCount(unread);
        if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
          if (unread > 0) {
            (navigator as any).setAppBadge(unread).catch(() => {});
          } else if ('clearAppBadge' in navigator) {
            (navigator as any).clearAppBadge().catch(() => {});
          }
        }
      }
    } catch {
      // Quiet fallback
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    load();

    const handleSync = () => void load();
    window.addEventListener('online', handleSync);
    window.addEventListener('tfhc:notifications-synced', handleSync);
    window.addEventListener('focus', handleSync);

    return () => {
      isMounted.current = false;
      window.removeEventListener('online', handleSync);
      window.removeEventListener('tfhc:notifications-synced', handleSync);
      window.removeEventListener('focus', handleSync);
    };
  }, [load]);

  const markAllRead = useCallback(async () => {
    const unreadIds = notifications.filter((n) => n.status === 'UNREAD').map((n) => n.id);
    if (!unreadIds.length) return;
    try {
      await fetchApi('/members/me/notifications/read', {
        method: 'PUT',
        body: JSON.stringify({ ids: unreadIds }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, status: 'READ' })));
      setUnreadCount(0);
      if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) {
        (navigator as any).clearAppBadge().catch(() => {});
      }
    } catch (err) {
      console.error('Failed to mark notifications read:', err);
    }
  }, [notifications]);

  return {
    notifications,
    unreadCount,
    loading,
    reload: load,
    markAllRead,
  };
}
