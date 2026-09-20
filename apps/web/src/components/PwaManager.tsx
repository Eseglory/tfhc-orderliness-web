'use client';

import { prepareDevice, clearDevice } from '../lib/pwa/device';
import { startMetrics, recordPwaMetric } from '../lib/pwa/metrics';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clearOperations, discardFailed, flushQueue, QUEUE_EVENT, queueStatus, QueueStatus } from '../lib/pwa/queue';

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };
const empty: QueueStatus = { pending: 0, failed: 0, syncing: false, message: '' };

export function PwaManager() {
  const pathname = usePathname();
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [queue, setQueue] = useState(empty);
  const [poor, setPoor] = useState(false);
  const [issue, setIssue] = useState('');
  const [online, setOnline] = useState(true);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);

  useEffect(() => {
    startMetrics();
    let alive = true;
    let registration: ServiceWorkerRegistration | undefined;

    if (typeof window !== 'undefined') {
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
      setIsStandalone(standalone);
      const userAgent = window.navigator.userAgent.toLowerCase();
      const ios = /iphone|ipad|ipod/.test(userAgent);
      setIsIos(ios);
    }

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
    const prompt = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallPrompt);
    };
    const installed = () => {
      setInstall(null);
      setIsStandalone(true);
    };
    const workerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_REQUEST') void flushQueue();
      if (event.data?.type === 'BACKGROUND_SYNC_COMPLETE') {
        refresh(); recordPwaMetric(event.data.pending ? 'sync_failure' : 'sync_success');
        if (!event.data.pending) window.dispatchEvent(new Event('tfhc:notifications-synced'));
      }
    };
    const inspect = () => {
      if (alive && registration) {
        if (registration.waiting) {
          setWaiting(registration.waiting);
        }
      }
    };
    const updateFound = () => {
      const installing = registration?.installing;
      if (installing) {
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            inspect();
          }
        });
      }
    };
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

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', workerMessage);
      void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(value => {
        if (!alive) return;
        registration = value;
        inspect();
        recordPwaMetric('registration');
        registration.addEventListener('updatefound', updateFound);
      }).catch(() => {
        if (alive) setIssue('Offline support could not start. You can continue using the connected app.');
        console.warn('[pwa] registration_failed');
      });
    }
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void flushQueue();
        refresh();
        if (navigator.onLine) void registration?.update().catch(() => undefined);
      }
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

  const isAuthPage = pathname === '/login' || pathname === '/register' || pathname === '/forgot-password' || pathname === '/reset-password' || pathname === '/verify-email';
  if (isAuthPage || (!pathname.startsWith('/admin') && !pathname.startsWith('/member'))) {
    return null;
  }

  return (
    <>
      <aside aria-label="App status" className="bg-surface-container/70 dark:bg-slate-900/80 backdrop-blur-md text-on-surface px-4 py-2 border-b border-outline-variant/15 text-xs">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
          {/* Left: Device & Offline Navigation Button */}
          <div className="flex items-center gap-2">
            <Link
              href="/member/settings"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container-lowest dark:bg-slate-800 text-xs font-bold text-on-surface border border-outline-variant/30 hover:border-primary hover:text-primary transition-all shadow-xs active:scale-95"
            >
              <span className="material-symbols-outlined text-[16px] text-primary">settings</span>
              <span>Settings &amp; Device Access</span>
            </Link>

            {/* Status Message */}
            {(issue || queue.syncing || queue.message || queue.pending > 0 || queue.failed > 0 || poor) && (
              <span role="status" aria-live="polite" className="text-on-surface-variant font-medium text-[11px] truncate max-w-xs sm:max-w-md">
                {issue || (queue.syncing ? 'Syncing changes…' : queue.message)}
                {queue.pending > 0 && ` (${queue.pending} pending)`}
                {queue.failed > 0 && ` (${queue.failed} need review)`}
                {poor && ' • Limited connection'}
              </span>
            )}
          </div>

          {/* Right: Actions (Install, Sync, Update) */}
          <div className="flex flex-wrap items-center gap-2">
            {(queue.pending > 0 || queue.failed > 0) && (
              <>
                <button
                  disabled={!online || queue.syncing}
                  onClick={() => void flushQueue()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-xs font-bold hover:bg-amber-500/25 transition-all active:scale-95 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[15px]">sync</span>
                  <span>Retry Sync</span>
                </button>
                <Link
                  href="/member/notifications"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-surface-container-lowest text-xs font-bold border border-outline-variant/30 text-on-surface hover:text-primary transition-all active:scale-95 shadow-xs"
                >
                  <span className="material-symbols-outlined text-[15px]">notifications</span>
                  <span>Review Activity</span>
                </Link>
                {queue.failed > 0 && (
                  <button
                    onClick={() => void discardFailed().catch(() => setIssue('Could not clear failed changes.'))}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20 text-xs font-semibold hover:bg-rose-500/20 active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[15px]">delete_sweep</span>
                    <span>Discard Failed</span>
                  </button>
                )}
              </>
            )}

            {waiting && (
              <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-2.5 py-1">
                <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">Update available</span>
                <button
                  disabled={queue.syncing}
                  onClick={update}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold shadow-xs hover:bg-emerald-700 active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[14px]">refresh</span>
                  <span>Update &amp; Reload</span>
                </button>
              </div>
            )}

            {!isStandalone && install && (
              <button
                onClick={async () => {
                  try { await install.prompt(); await install.userChoice; } catch { /* Dismissal is harmless. */ }
                  setInstall(null);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-extrabold shadow-sm hover:opacity-90 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-[16px]">install_mobile</span>
                <span>Install App</span>
              </button>
            )}

            {!isStandalone && !install && isIos && (
              <button
                onClick={() => setShowIosModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-extrabold shadow-sm hover:opacity-90 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-[16px]">add_to_home_screen</span>
                <span>Install on iOS</span>
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Prominent Version Update Notification Banner */}
      {waiting && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed bottom-5 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 rounded-2xl bg-[#0b1c30] text-white p-4 shadow-2xl border border-slate-700/80 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-5 duration-300"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f2320c]/20 text-[#f2320c]">
              <span className="material-symbols-outlined text-2xl animate-spin">sync</span>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-extrabold text-white leading-tight">New version available</h4>
              <p className="text-xs text-slate-300 mt-0.5">
                A new version of TFHC-ORDERLINESS is available.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={update}
                  disabled={queue.syncing}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#f2320c] hover:bg-[#d82a08] text-white font-extrabold text-xs shadow-lg shadow-red-500/25 active:scale-95 transition-all uppercase tracking-wider"
                >
                  <span className="material-symbols-outlined text-sm">system_update</span>
                  <span>UPDATE NOW</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* iOS Installation Instruction Modal */}
      {showIosModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-install-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in"
          onClick={() => setShowIosModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 p-6 text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0 sm:zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-[#f2320c] dark:bg-red-950/50">
                  <span className="material-symbols-outlined text-xl">install_mobile</span>
                </div>
                <h3 id="ios-install-title" className="text-base font-extrabold">Install on iPhone / iPad</h3>
              </div>
              <button
                onClick={() => setShowIosModal(false)}
                className="rounded-full p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 font-extrabold text-slate-900 dark:text-white">1</span>
                <p className="pt-0.5">
                  Tap the <strong className="text-slate-900 dark:text-white">Share</strong> icon <span className="material-symbols-outlined align-middle text-sm text-blue-500">ios_share</span> in your Safari or Chrome navigation bar.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 font-extrabold text-slate-900 dark:text-white">2</span>
                <p className="pt-0.5">
                  Scroll down the share sheet and select <strong className="text-slate-900 dark:text-white">&ldquo;Add to Home Screen&rdquo;</strong> <span className="material-symbols-outlined align-middle text-sm">add_box</span>.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 font-extrabold text-slate-900 dark:text-white">3</span>
                <p className="pt-0.5">
                  Tap <strong className="text-slate-900 dark:text-white">&ldquo;Add&rdquo;</strong> in the top right corner to install TFHC-ORDERLINESS on your home screen.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowIosModal(false)}
              className="mt-6 w-full rounded-2xl bg-[#0b1c30] dark:bg-slate-800 py-3 text-center text-xs font-extrabold text-white transition-all active:scale-98 shadow-sm"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
