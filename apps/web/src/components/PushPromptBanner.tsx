'use client';

import React, { useEffect, useState } from 'react';
import { fetchApi } from '../lib/api';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushPromptBanner() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('PushManager' in window) || !('serviceWorker' in navigator) || !('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      // Auto-verify and sync push subscription with backend
      fetchApi<{ enabled: boolean; publicKey: string | null }>('/push/config')
        .then(async (cfg) => {
          if (!cfg?.enabled || !cfg.publicKey) return;
          const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
          await navigator.serviceWorker.ready;
          let sub = await reg.pushManager.getSubscription();
          if (!sub) {
            const bytes = urlBase64ToUint8Array(cfg.publicKey);
            sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
          }
          if (sub) {
            await fetchApi('/push/subscriptions', {
              method: 'POST',
              body: JSON.stringify(sub.toJSON()),
            });
          }
        })
        .catch(() => {});
      return;
    }

    if (Notification.permission !== 'default') return;
    if (sessionStorage.getItem('dismissed_push_banner') === 'true') return;

    fetchApi<{ enabled: boolean; publicKey: string | null }>('/push/config')
      .then((cfg) => {
        if (cfg?.enabled && cfg.publicKey) {
          setKey(cfg.publicKey);
          setShow(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleEnable = async () => {
    if (!key) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setShow(false);
        sessionStorage.setItem('dismissed_push_banner', 'true');
        return;
      }
      const registration =
        (await navigator.serviceWorker.getRegistration()) ||
        (await navigator.serviceWorker.register('/sw.js'));
      await navigator.serviceWorker.ready;
      const bytes = urlBase64ToUint8Array(key);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes,
      });
      await fetchApi('/push/subscriptions', {
        method: 'POST',
        body: JSON.stringify(subscription.toJSON()),
      });
      setShow(false);
    } catch (err) {
      console.warn('Push subscription failed:', err);
      setShow(false);
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem('dismissed_push_banner', 'true');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950 p-4 text-white shadow-lg border border-indigo-800/40 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
            <span className="material-symbols-outlined text-xl">notifications_active</span>
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Enable Real-Time Notifications</h4>
            <p className="text-xs text-slate-300">
              Get instant alerts for service reminders, general announcements, and chat messages.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button
            onClick={handleDismiss}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            Later
          </button>
          <button
            onClick={handleEnable}
            disabled={busy}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#f2320c] hover:bg-[#d82a08] text-white font-bold text-xs shadow-md shadow-red-500/20 transition-all active:scale-95 disabled:opacity-50"
          >
            {busy ? 'Enabling...' : 'Enable Push'}
          </button>
        </div>
      </div>
    </div>
  );
}
