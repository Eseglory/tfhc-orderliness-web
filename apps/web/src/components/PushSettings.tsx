'use client';
import { useEffect, useState } from 'react';
import { fetchApi } from '../lib/api';

export function PushSettings() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('PushManager' in window) || !('serviceWorker' in navigator) || !('Notification' in window)) return;
    setSupported(true);

    void fetchApi<{ enabled: boolean; publicKey: string | null }>('/push/config')
      .then((config) => {
        setKey(config.publicKey);
        if (!config.enabled) setMessage('Device notifications are not configured yet. Activity remains available here.');
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
    try {
      if (!enabled && (await Notification.requestPermission()) !== 'granted') {
        setMessage('Notifications are off. You can change permission in browser settings.');
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
        setMessage('Device notifications disabled.');
      } else {
        if (!key) throw new Error('Device notifications are not configured yet.');
        const bytes = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
        subscription = subscription || (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes }));
        try {
          await fetchApi('/push/subscriptions', { method: 'POST', body: JSON.stringify(subscription.toJSON()) });
        } catch (error) {
          await subscription.unsubscribe();
          throw error;
        }
        setEnabled(true);
        setMessage('Device notifications enabled for this session.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not change notifications.');
    } finally {
      setBusy(false);
    }
  };

  const sendTestAlert = async () => {
    setTestBusy(true);
    setMessage('');
    try {
      const res = await fetchApi<{ success: boolean; push?: { sent: number; failed: number } }>('/members/me/notifications/test', {
        method: 'POST',
      });
      if (res?.success) {
        setMessage('🔔 Test Service Reminder sent! Check your notification list below and your device lock screen.');
        window.dispatchEvent(new CustomEvent('tfhc:notifications-synced'));
      }
    } catch (err: any) {
      setMessage(err?.message || 'Could not send test notification.');
    } finally {
      setTestBusy(false);
    }
  };

  return (
    <section aria-label="Device notifications" className="p-4 rounded-xl bg-surface-container space-y-3 border border-outline-variant/15">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-on-surface">Device notifications</h2>
        {enabled && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </span>
        )}
      </div>
      <p className="text-sm text-on-surface-variant leading-relaxed">
        Receive live alerts for service reminders, meeting check-ins, duty updates, and unit announcements directly on your device.
      </p>

      <div className="flex items-center gap-3 flex-wrap pt-1">
        {supported ? (
          <button
            className="px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold hover:opacity-90 disabled:opacity-50 transition active:scale-95"
            disabled={busy || (!enabled && !key)}
            onClick={toggle}
          >
            {busy ? 'Saving…' : enabled ? 'Disable device notifications' : 'Enable device notifications'}
          </button>
        ) : (
          <p className="text-xs text-on-surface-variant">Use a supported browser. On iPhone or iPad, add the app to your Home Screen first.</p>
        )}

        <button
          onClick={sendTestAlert}
          disabled={testBusy}
          className="px-4 py-2 rounded-lg border border-outline-variant bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-bold transition active:scale-95 flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-sm text-amber-500">notifications_active</span>
          {testBusy ? 'Sending…' : 'Send Test Alert Now'}
        </button>
      </div>

      {message && (
        <p role="status" className="text-xs font-medium text-primary mt-2">
          {message}
        </p>
      )}
    </section>
  );
}
