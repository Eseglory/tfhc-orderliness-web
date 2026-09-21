'use client';

import { prepareDevice, clearDevice } from '../lib/pwa/device';
import { startMetrics, recordPwaMetric } from '../lib/pwa/metrics';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clearOperations, discardFailed, flushQueue, QUEUE_EVENT, queueStatus, QueueStatus } from '../lib/pwa/queue';

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };
const empty: QueueStatus = { pending: 0, failed: 0, syncing: false, message: '' };

export function PwaManager() {
  const pathname = usePathname();
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const installRef = useRef<InstallPrompt | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [queue, setQueue] = useState(empty);
  const [poor, setPoor] = useState(false);
  const [issue, setIssue] = useState('');
  const [online, setOnline] = useState(true);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);
  const [dismissedUpdate, setDismissedUpdate] = useState(false);
  const [dismissedInstallBanner, setDismissedInstallBanner] = useState(false);

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

    const onCustomInstallTrigger = () => {
      if (installRef.current) {
        void installRef.current.prompt().then(() => installRef.current?.userChoice).catch(() => undefined);
      } else {
        setShowIosModal(true);
      }
    };
    window.addEventListener('tfhc:open-install-prompt', onCustomInstallTrigger);

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
      installRef.current = event as InstallPrompt;
      setInstall(event as InstallPrompt);
    };
    const installed = () => {
      installRef.current = null;
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
      window.removeEventListener('tfhc:open-install-prompt', onCustomInstallTrigger);
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
  if (isAuthPage) {
    return null;
  }

  const hasNotice = Boolean(queue.syncing || queue.pending > 0 || queue.failed > 0 || issue || poor);
  const isMemberApp = pathname.startsWith('/member');

  return (
    <>
      {hasNotice && (
        <aside aria-label="App status" className="bg-surface-container/80 dark:bg-slate-900/90 backdrop-blur-md text-on-surface px-3 py-1.5 sm:px-4 sm:py-2 border-b border-outline-variant/15 text-xs">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2">
            {/* Left: Device & Offline Navigation Button (only in member app) */}
            <div className="flex items-center gap-2 min-w-0">
              {isMemberApp && (
                <Link
                  href="/member/settings"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-surface-container-lowest dark:bg-slate-800 text-[11px] sm:text-xs font-bold text-on-surface border border-outline-variant/30 hover:border-primary hover:text-primary transition-all shadow-xs active:scale-95 shrink-0"
                >
                  <span className="material-symbols-outlined text-[15px] text-primary">settings</span>
                  <span className="hidden sm:inline">Settings &amp; Device Access</span>
                  <span className="sm:hidden">Settings</span>
                </Link>
              )}

              {/* Status Message */}
              {(issue || queue.syncing || queue.message || queue.pending > 0 || queue.failed > 0 || poor) && (
                <span role="status" aria-live="polite" className="text-on-surface-variant font-medium text-[11px] truncate max-w-[200px] sm:max-w-md">
                  {issue || (queue.syncing ? 'Syncing changes…' : queue.message)}
                  {queue.pending > 0 && ` (${queue.pending} pending)`}
                  {queue.failed > 0 && ` (${queue.failed} need review)`}
                  {poor && ' • Limited connection'}
                </span>
              )}
            </div>

            {/* Right: Actions (Install, Sync, Update) */}
            <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
              {(queue.pending > 0 || queue.failed > 0) && (
                <>
                  <button
                    disabled={!online || queue.syncing}
                    onClick={() => void flushQueue()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-[11px] sm:text-xs font-bold hover:bg-amber-500/25 transition-all active:scale-95 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[14px]">sync</span>
                    <span>Sync</span>
                  </button>
                  <Link
                    href="/member/notifications"
                    className="inline-flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-surface-container-lowest text-[11px] sm:text-xs font-bold border border-outline-variant/30 text-on-surface hover:text-primary transition-all active:scale-95 shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[14px]">notifications</span>
                    <span className="hidden sm:inline">Review</span>
                  </Link>
                </>
              )}

              {waiting && (
                <div className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-2 py-0.5 sm:px-2.5 sm:py-1">
                  <span className="hidden sm:inline text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">Update available</span>
                  <button
                    disabled={queue.syncing}
                    onClick={update}
                    className="inline-flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-emerald-600 text-white text-[11px] sm:text-xs font-bold shadow-xs hover:bg-emerald-700 active:scale-95 transition-all"
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
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-xl bg-primary text-on-primary text-[11px] sm:text-xs font-extrabold shadow-sm hover:opacity-90 active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[15px]">install_mobile</span>
                  <span>Install App</span>
                </button>
              )}
            </div>
          </div>
        </aside>
      )}

      {/* Floating Install Prompt Banner for Android/Desktop/iOS */}
      {!isStandalone && !dismissedInstallBanner && (install || isIos) && (
        <aside
          role="region"
          aria-label="Install TFHC-ORDERLINESS"
          className={`fixed left-3 right-3 sm:left-auto sm:right-6 sm:max-w-sm z-[70] rounded-2xl bg-surface-container-high/95 dark:bg-slate-900/95 text-on-surface p-3.5 shadow-xl border border-outline-variant/30 backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-300 ${
            isMemberApp
              ? 'bottom-[calc(5.2rem+env(safe-area-inset-bottom,0px))] sm:bottom-6'
              : 'bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:bottom-6'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-2xl">install_mobile</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <h4 className="text-xs font-extrabold text-on-surface truncate">Install TFHC-ORDERLINESS</h4>
                <button
                  type="button"
                  onClick={() => setDismissedInstallBanner(true)}
                  className="p-1 -mr-1 rounded-lg text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                  title="Dismiss banner"
                  aria-label="Dismiss banner"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>
              <p className="text-[11px] text-on-surface-variant line-clamp-1 mt-0.5">
                {isIos ? 'Add to Home Screen for voice calls & notifications' : 'Install app for instant messaging & voice calls'}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDismissedInstallBanner(true)}
                  className="px-2.5 py-1 rounded-lg bg-surface-container hover:bg-surface-container-highest text-on-surface text-[11px] font-semibold transition-all cursor-pointer"
                >
                  Later
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (install) {
                      try {
                        await install.prompt();
                        await install.userChoice;
                      } catch { /* dismissed */ }
                      setInstall(null);
                    } else if (isIos) {
                      setShowIosModal(true);
                    }
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:opacity-90 text-on-primary font-bold text-[11px] shadow-sm transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  <span>{isIos ? 'HOW TO INSTALL' : 'INSTALL NOW'}</span>
                </button>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* Prominent Version Update Notification Banner (Mobile Responsive) */}
      {waiting && !dismissedUpdate && (
        <div
          role="alert"
          aria-live="assertive"
          className={`fixed left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md z-[80] rounded-2xl bg-[#0b1c30] text-white p-3.5 sm:p-4 shadow-2xl border border-slate-700/80 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-5 duration-300 ${
            isMemberApp
              ? 'bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:bottom-6'
              : 'bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:bottom-6'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-[#f2320c]/20 text-[#f2320c]">
              <span className="material-symbols-outlined text-xl sm:text-2xl animate-spin">sync</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs sm:text-sm font-extrabold text-white leading-tight">New version available</h4>
                <button
                  type="button"
                  onClick={() => setDismissedUpdate(true)}
                  className="p-1 -mr-1 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Dismiss notification"
                  aria-label="Dismiss notification"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5">
                A new version of TFHC-ORDERLINESS is available with the latest updates.
              </p>
              <div className="mt-2.5 sm:mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDismissedUpdate(true)}
                  className="px-3 py-2 sm:py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[11px] sm:text-xs font-semibold active:scale-95 transition-all cursor-pointer"
                >
                  Later
                </button>
                <button
                  type="button"
                  onClick={update}
                  disabled={queue.syncing}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-2.5 rounded-xl bg-[#f2320c] hover:bg-[#d82a08] text-white font-extrabold text-[11px] sm:text-xs shadow-lg shadow-red-500/25 active:scale-95 transition-all uppercase tracking-wider cursor-pointer disabled:opacity-50"
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
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setShowIosModal(false)}
        >
          <div
            className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 p-6 text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-[#f2320c] dark:bg-red-950/50">
                  <span className="material-symbols-outlined text-xl">install_mobile</span>
                </div>
                <h3 id="ios-install-title" className="text-base font-extrabold">Install on iPhone / iPad</h3>
              </div>
              <button
                onClick={() => setShowIosModal(false)}
                className="rounded-full p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
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
              type="button"
              onClick={() => setShowIosModal(false)}
              className="mt-6 w-full rounded-2xl bg-[#0b1c30] hover:bg-[#162a42] dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 py-3 text-center text-xs font-extrabold text-white transition-all active:scale-95 shadow-md shrink-0 cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
