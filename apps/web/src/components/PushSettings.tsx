'use client';
import { useEffect, useState } from 'react';
import { fetchApi } from '../lib/api';

export function PushSettings() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!('PushManager' in window) || !('serviceWorker' in navigator) || !('Notification' in window)) return;
    setSupported(true);
    void fetchApi<{ enabled: boolean; publicKey: string | null }>('/push/config').then(config => {
      setKey(config.publicKey);
      if (!config.enabled) setMessage('Device notifications are not configured yet. Activity remains available here.');
    }).catch(() => setMessage('Connect to check notification settings.'));
    void navigator.serviceWorker.getRegistration().then(async registration => {
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const result = await fetchApi<{ subscribed: boolean }>('/push/status', { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) });
        setEnabled(result.subscribed);
      }
    }).catch(() => undefined);
  }, []);
  const toggle = async () => {
    setBusy(true); setMessage('');
    try {
      // Ask from the button gesture, before any network request (required on iOS).
      if (!enabled && await Notification.requestPermission() !== 'granted') {
        setMessage('Notifications are off. You can change permission in browser settings.'); return;
      }
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.active) throw new Error('Offline support is still starting. Reload and try again.');
      let subscription = await registration.pushManager.getSubscription();
      if (enabled && subscription) {
        await subscription.unsubscribe();
        await fetchApi('/push/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => undefined);
        setEnabled(false); setMessage('Device notifications disabled.');
      } else {
        if (!key) throw new Error('Device notifications are not configured yet.');
        const bytes = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
        subscription = subscription || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
        try {
          await fetchApi('/push/subscriptions', { method: 'POST', body: JSON.stringify(subscription.toJSON()) });
        } catch (error) { await subscription.unsubscribe(); throw error; }
        setEnabled(true); setMessage('Device notifications enabled for this session.');
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not change notifications.'); }
    finally { setBusy(false); }
  };
  return <section aria-label="Device notifications" className="p-4 rounded-xl bg-surface-container space-y-2">
    <h2 className="font-bold">Device notifications</h2>
    <p className="text-sm">Receive a private reminder to open Activity. Private activity details will not appear on your lock screen.</p>
    {supported ? <button className="underline min-h-11 disabled:opacity-50" disabled={busy || (!enabled && !key)} onClick={toggle}>
      {busy ? 'Saving…' : enabled ? 'Disable device notifications' : 'Enable device notifications'}
    </button> : <p className="text-sm">Use a supported browser. On iPhone or iPad, add the app to your Home Screen first.</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
