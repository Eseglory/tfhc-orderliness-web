'use client';
import { useEffect, useState } from 'react';
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

export function PushSettings() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('PushManager' in window) || !('serviceWorker' in navigator) || !('Notification' in window)) return;
    setSupported(true);

    void fetchApi<{ enabled: boolean; publicKey: string | null }>('/push/config')
      .then((config) => {
        setKey(config.publicKey);
        if (!config.enabled) setMessage('Device notifications are not configured yet. In-app alerts remain active here.');
      })
      .catch(() => setMessage('Connect to check notification settings.'));

    void (async () => {
      try {
        const registration = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
        await navigator.serviceWorker.ready;
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          const result = await fetchApi<{ subscribed: boolean }>('/push/status', {
            method: 'POST',
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
          setEnabled(result.subscribed);
        }
      } catch {
        // ignore SW background errors
      }
    })();
  }, []);

  const toggle = async () => {
    setBusy(true);
    setMessage('');
    setIsError(false);
    try {
      if (!enabled && (await Notification.requestPermission()) !== 'granted') {
        setIsError(true);
        setMessage('Notifications are blocked in your browser. Please allow notifications in site settings.');
        return;
      }
      const registration = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (enabled && subscription) {
        await subscription.unsubscribe();
        await fetchApi('/push/subscriptions', {
          method: 'DELETE',
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => undefined);
        setEnabled(false);
        setMessage('Device notifications turned off.');
      } else {
        if (!key) throw new Error('Device notifications are not configured yet.');
        const bytes = urlBase64ToUint8Array(key);
        const existingKey = subscription?.options.applicationServerKey;
        if (subscription && existingKey &&
            (existingKey.byteLength !== bytes.length || new Uint8Array(existingKey).some((value, index) => value !== bytes[index]))) {
          await fetchApi('/push/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) });
          await subscription.unsubscribe();
          subscription = null;
        }
        subscription = subscription || (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes }));
        try {
          await fetchApi('/push/subscriptions', { method: 'POST', body: JSON.stringify(subscription.toJSON()) });
        } catch (error) {
          await subscription.unsubscribe();
          throw error;
        }
        setEnabled(true);
        setMessage('Device push notifications successfully enabled!');
      }
    } catch (error: any) {
      setIsError(true);
      const rawMsg = error instanceof Error ? error.message : String(error || '');
      if (/push service error|AbortError|Registration failed/i.test(rawMsg)) {
        setMessage(
          'Notice for Brave / Private browsers: Please enable "Use Google services for push messaging" in brave://settings/privacy to allow lockscreen push, or install this app. In-app alerts are active!'
        );
      } else {
        setMessage(rawMsg || 'Could not configure device push notifications.');
      }
    } finally {
      setBusy(false);
    }
  };

  const sendTestAlert = async () => {
    setTestBusy(true);
    setMessage('');
    setIsError(false);
    try {
      const res = await fetchApi<{ success: boolean; push?: { sent: number; failed: number } }>('/members/me/notifications/test', {
        method: 'POST',
      });
      if (res?.success) {
        setMessage('🔔 Test Service Alert delivered! Check your notification list below.');
        window.dispatchEvent(new CustomEvent('tfhc:notifications-synced'));
      }
    } catch (err: any) {
      setIsError(true);
      setMessage(err?.message || 'Could not send test notification.');
    } finally {
      setTestBusy(false);
    }
  };

  return (
    <section aria-label="Device notifications" className="p-5 rounded-2xl bg-surface-container space-y-4 border border-outline-variant/20 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-lg">notifications</span>
          </div>
          <h2 className="font-bold text-base text-on-surface">Device Notifications</h2>
        </div>
        {enabled ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </span>
        ) : (
          <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant">
            Off
          </span>
        )}
      </div>

      <p className="text-sm text-on-surface-variant leading-relaxed">
        Receive instant alerts for Sunday service duty, meeting check-ins, department headcounts, and urgent church announcements.
      </p>

      <div className="flex items-center gap-3 flex-wrap pt-2">
        {supported ? (
          <button
            type="button"
            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-sm flex items-center gap-2 ${
              enabled
                ? 'bg-surface-container-highest hover:bg-surface-container text-on-surface border border-outline-variant/40'
                : 'bg-primary hover:opacity-95 text-on-primary'
            } disabled:opacity-50`}
            disabled={busy || (!enabled && !key)}
            onClick={toggle}
          >
            <span className="material-symbols-outlined text-base">
              {enabled ? 'notifications_off' : 'notifications_active'}
            </span>
            {busy ? 'Saving…' : enabled ? 'Disable Push Notifications' : 'Enable Push Notifications'}
          </button>
        ) : (
          <p className="text-xs text-on-surface-variant">Use a supported browser or add the app to your Home Screen to enable native push.</p>
        )}

        <button
          type="button"
          onClick={sendTestAlert}
          disabled={testBusy}
          className="px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-sm font-semibold transition-all active:scale-95 flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-base text-amber-500">send</span>
          {testBusy ? 'Sending…' : 'Send Test Alert Now'}
        </button>
      </div>

      {message && (
        <div
          role="status"
          className={`p-3 rounded-xl text-xs font-medium border leading-relaxed ${
            isError
              ? 'bg-error-container/30 text-error border-error/30'
              : 'bg-primary/10 text-primary border-primary/20'
          }`}
        >
          {message}
        </div>
      )}
    </section>
  );
}
