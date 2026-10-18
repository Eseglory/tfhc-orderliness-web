'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { fetchApi } from '../lib/api';
import { alarmEngine } from '../lib/alarm-engine';

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

const STORAGE_CHOICE_KEY = 'tfhc_reminder_permission_decision';

export function ReminderPermissionPrompt() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [showDeniedGuide, setShowDeniedGuide] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    if (!user || typeof window === 'undefined') return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

    // 1. If permission already granted, auto-register push silently and arm audio
    if (Notification.permission === 'granted') {
      alarmEngine.unlockAudioContext();
      fetchApi<{ enabled: boolean; publicKey: string | null }>('/push/config')
        .then(async (cfg) => {
          if (!cfg?.enabled || !cfg.publicKey) return;
          const reg =
            (await navigator.serviceWorker.getRegistration()) ||
            (await navigator.serviceWorker.register('/sw.js'));
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
            }).catch(() => undefined);
          }
        })
        .catch(() => undefined);
      return;
    }

    // 2. If user already made a decision (e.g. dismissed or denied), respect their choice
    try {
      const decision = localStorage.getItem(STORAGE_CHOICE_KEY);
      if (decision === 'dismissed' || decision === 'denied' || decision === 'enabled') {
        return;
      }
    } catch {
      // ignore
    }

    // 3. Only show prompt if Notification.permission is 'default' and not yet decided
    if (Notification.permission === 'default') {
      fetchApi<{ enabled: boolean; publicKey: string | null }>('/push/config')
        .then((cfg) => {
          if (cfg?.publicKey) setPublicKey(cfg.publicKey);
          // Slight delay for smooth onboarding entry
          const timer = setTimeout(() => setIsOpen(true), 1500);
          return () => clearTimeout(timer);
        })
        .catch(() => {
          const timer = setTimeout(() => setIsOpen(true), 1500);
          return () => clearTimeout(timer);
        });
    }
  }, [user]);

  const handleEnable = async () => {
    setIsBusy(true);
    try {
      // 1. Unlock audio context on this explicit user tap
      alarmEngine.unlockAudioContext();

      // 2. Request browser notification permission
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        try {
          localStorage.setItem(STORAGE_CHOICE_KEY, 'enabled');
        } catch {
          // ignore
        }

        // 3. Register Web Push subscription
        if (publicKey) {
          const reg =
            (await navigator.serviceWorker.getRegistration()) ||
            (await navigator.serviceWorker.register('/sw.js'));
          await navigator.serviceWorker.ready;
          const bytes = urlBase64ToUint8Array(publicKey);
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: bytes,
          });
          await fetchApi('/push/subscriptions', {
            method: 'POST',
            body: JSON.stringify(sub.toJSON()),
          }).catch(() => undefined);
        }

        setIsOpen(false);
      } else if (perm === 'denied') {
        try {
          localStorage.setItem(STORAGE_CHOICE_KEY, 'denied');
        } catch {
          // ignore
        }
        setShowDeniedGuide(true);
      } else {
        setIsOpen(false);
      }
    } catch (err) {
      console.warn('Error enabling meeting reminders:', err);
      setIsOpen(false);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_CHOICE_KEY, 'dismissed');
    } catch {
      // ignore
    }
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reminder-prompt-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-300"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-surface-container border border-primary/20 shadow-2xl p-6 sm:p-7 space-y-6 text-on-surface animate-in zoom-in-95 duration-200">
        {/* Glow accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary via-indigo-500 to-amber-500" />

        {/* Header with Icon */}
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
            <span className="material-symbols-outlined text-2xl">alarm_on</span>
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-primary">
              Smart Meeting Alerts
            </span>
            <h3
              id="reminder-prompt-title"
              className="text-lg sm:text-xl font-black text-on-surface tracking-tight"
            >
              Never Miss a Meeting or Service
            </h3>
            <p className="text-xs sm:text-sm text-on-surface-variant mt-1 leading-relaxed">
              Enable smart meeting reminders and device alarms to be alerted at the exact scheduled start of Wednesday meetings, Sunday services, and team gatherings.
            </p>
          </div>
        </div>

        {/* Key Feature Benefits */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <div className="p-3 rounded-2xl bg-surface-container-high/60 border border-outline-variant/20 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
              <span className="material-symbols-outlined text-sm">schedule</span>
              <span>Exact-Time</span>
            </div>
            <p className="text-[11px] text-on-surface-variant">
              Rings on schedule when clock-in begins.
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-surface-container-high/60 border border-outline-variant/20 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-500">
              <span className="material-symbols-outlined text-sm">volume_up</span>
              <span>Audible Alarm</span>
            </div>
            <p className="text-[11px] text-on-surface-variant">
              Audible ringing with Stop &amp; Snooze controls.
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-surface-container-high/60 border border-outline-variant/20 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-500">
              <span className="material-symbols-outlined text-sm">notifications_active</span>
              <span>Lockscreen</span>
            </div>
            <p className="text-[11px] text-on-surface-variant">
              Works even when the tab is backgrounded.
            </p>
          </div>
        </div>

        {/* If user previously denied */}
        {showDeniedGuide && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold">
              <span className="material-symbols-outlined text-base">info</span>
              <span>Notifications are Blocked in Browser</span>
            </div>
            <p className="leading-relaxed">
              To allow meeting alarms: click the <strong>Lock icon</strong> or <strong>Site Settings</strong> in your browser address bar, set <strong>Notifications</strong> to <strong>Allow</strong>, and refresh the page.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleDismiss}
            disabled={isBusy}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
          >
            Maybe Later
          </button>
          <button
            type="button"
            onClick={handleEnable}
            disabled={isBusy}
            className="px-5 py-2.5 rounded-xl bg-primary hover:opacity-95 text-on-primary text-xs font-black shadow-md shadow-primary/25 transition-all active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base">notifications_active</span>
            <span>{isBusy ? 'Enabling...' : 'Enable Reminders & Alarm'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
