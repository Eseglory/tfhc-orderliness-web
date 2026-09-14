'use client';

import { prepareDevice, clearDevice } from '../lib/pwa/device';
import { startMetrics, recordPwaMetric } from '../lib/pwa/metrics';
import { useEffect, useState } from 'react';
import { clearOperations, discardFailed, flushQueue, QUEUE_EVENT, queueStatus, QueueStatus } from '../lib/pwa/queue';

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };
const empty: QueueStatus = { pending: 0, failed: 0, syncing: false, message: '' };

export function PwaManager() {
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [queue, setQueue] = useState(empty);
  const [poor, setPoor] = useState(false);
  const [issue, setIssue] = useState('');
  const [online, setOnline] = useState(true);

  useEffect(() => {
    startMetrics();
    let alive = true;
    let registration: ServiceWorkerRegistration | undefined;
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    const network = () => {
      setOnline(navigator.onLine);
      setPoor(Boolean(connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType || '')));
    };
    const refresh = () => { void queueStatus().then(value => alive && setQueue(value)).catch(() => {
      if (alive) setIssue('Offline storage is unavailable. Changes need an internet connection.');
    }); };
    const resume = () => {
      network();
      if (document.visibilityState === 'visible') {
        void prepareDevice().catch(() => undefined);
        void flushQueue();
        if (navigator.onLine) void registration?.update().catch(() => undefined);
      }
    };
    const clear = () => { void clearOperations().then(() => clearDevice()).catch(() => undefined); };
    const storage = (event: StorageEvent) => {
      if (event.key === 'tfhc_token' || event.key === null) {
        clear();
        // Discard rendered account data on a remembered-session change.
        window.location.reload();
      }
    };
    const prompt = (event: Event) => { event.preventDefault(); setInstall(event as InstallPrompt); };
    const installed = () => setInstall(null);
    const workerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_REQUEST') void flushQueue();
      if (event.data?.type === 'BACKGROUND_SYNC_COMPLETE') {
        refresh(); recordPwaMetric(event.data.pending ? 'sync_failure' : 'sync_success');
        if (!event.data.pending) window.dispatchEvent(new Event('tfhc:notifications-synced'));
      }
    };
    const inspect = () => { if (alive) setWaiting(registration?.waiting ?? null); };
    const updateFound = () => registration?.installing?.addEventListener('statechange', inspect);
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel('tfhc-pwa') : null;
    if (channel) channel.onmessage = event => {
      refresh();
      if (event.data === 'notification-reads-synced') window.dispatchEvent(new Event('tfhc:notifications-synced'));
    };
    network(); refresh(); void prepareDevice().catch(() => undefined); void flushQueue();
    window.addEventListener(QUEUE_EVENT, refresh);
    window.addEventListener('tfhc:logout', clear);
    const accountChanged = () => { void clearOperations().then(prepareDevice).catch(() => undefined); };
    window.addEventListener('tfhc:account-change', accountChanged);
    window.addEventListener('tfhc:offline-cleared', resume);
    window.addEventListener('storage', storage);
    window.addEventListener('online', resume);
    window.addEventListener('offline', network);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    connection?.addEventListener('change', network);
    window.addEventListener('beforeinstallprompt', prompt);
    window.addEventListener('appinstalled', installed);
    // Production builds work on localhost for real service-worker testing.
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.addEventListener('message', workerMessage);
      void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(value => {
        if (!alive) return;
        registration = value; inspect(); recordPwaMetric('registration');
        registration.addEventListener('updatefound', updateFound);
      }).catch(() => {
        if (alive) setIssue('Offline support could not start. You can continue using the connected app.');
        console.warn('[pwa] registration_failed');
      });
    }
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') { void flushQueue(); refresh(); }
    }, 15000);
    return () => {
      alive = false; clearInterval(timer); channel?.close();
      window.removeEventListener(QUEUE_EVENT, refresh);
      window.removeEventListener('tfhc:logout', clear);
      window.removeEventListener('tfhc:account-change', accountChanged);
      window.removeEventListener('tfhc:offline-cleared', resume);
      window.removeEventListener('storage', storage);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', network);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
      connection?.removeEventListener('change', network);
      window.removeEventListener('beforeinstallprompt', prompt);
      window.removeEventListener('appinstalled', installed);
      navigator.serviceWorker?.removeEventListener('message', workerMessage);
      registration?.removeEventListener('updatefound', updateFound);
    };
  }, []);

  const update = () => {
    // Never reload another tab with a form in progress. Only this explicit action reloads.
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    recordPwaMetric('update');
    waiting?.postMessage({ type: 'ACTIVATE_UPDATE' });
  };

  return <aside aria-label="App status" className="bg-surface-container text-on-surface px-4 py-2 text-sm flex flex-wrap items-center justify-center gap-3 border-b border-outline-variant/20">
    <a href="/member/offline" className="underline min-h-11 inline-flex items-center">Offline and device settings</a>
    <span role="status" aria-live="polite">{issue || (queue.syncing ? 'Syncing notification reads…' : queue.message)}
      {queue.pending > 0 && ` ${queue.pending} changes pending.`}
      {queue.failed > 0 && ` ${queue.failed} changes need review.`}
      {poor && ' Limited connection. Media may take longer to load.'}
    </span>
    {(queue.pending > 0 || queue.failed > 0) && <>
      <button className="underline min-h-11" disabled={!online || queue.syncing} onClick={() => void flushQueue()}>Retry sync</button>
      <a className="underline min-h-11 inline-flex items-center" href="/member/notifications">Review Activity</a>
      {queue.failed > 0 && <button className="underline min-h-11" onClick={() => void discardFailed().catch(() => setIssue('Could not clear failed changes.'))}>Discard failed reads</button>}
    </>}
    {waiting && <><span>Update available. Save your work before reloading.</span><button className="underline min-h-11" disabled={queue.syncing} onClick={update}>Update and reload</button></>}
    {install && <button className="underline min-h-11" onClick={async () => {
      try { await install.prompt(); await install.userChoice; } catch { /* Dismissal is harmless. */ }
      setInstall(null);
    }}>Install app</button>}
  </aside>;
}
