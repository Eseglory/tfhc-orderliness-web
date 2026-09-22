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
  const [isAndroid, setIsAndroid] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installModalTab, setInstallModalTab] = useState<'android' | 'ios' | 'desktop'>('android');
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
      const ios = /iphone|ipad|ipod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const android = /android/.test(userAgent);
      const mobile = ios || android || /mobile|touch/i.test(userAgent);
      setIsIos(ios);
      setIsAndroid(android);
      setIsMobile(mobile);
      setInstallModalTab(ios ? 'ios' : android ? 'android' : 'desktop');
    }

    const onCustomInstallTrigger = () => {
      if (installRef.current) {
        void installRef.current.prompt().then(() => installRef.current?.userChoice).catch(() => undefined);
      } else {
        setShowInstallModal(true);
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
  const hasNotice = !isAuthPage && Boolean(queue.syncing || queue.pending > 0 || queue.failed > 0 || issue || poor);
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

              {!isStandalone && (
                <button
                  onClick={async () => {
                    if (installRef.current) {
                      try { await installRef.current.prompt(); await installRef.current.userChoice; } catch { /* dismissed */ }
                      setInstall(null);
                    } else {
                      setShowInstallModal(true);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-xl bg-primary text-on-primary text-[11px] sm:text-xs font-extrabold shadow-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer"
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
      {!isStandalone && !dismissedInstallBanner && (
        <aside
          role="region"
          aria-label="Install TFHC-ORDERLINESS"
          className={`fixed left-3 right-3 sm:left-auto sm:right-6 sm:max-w-sm z-[70] rounded-2xl bg-surface-container-high/95 dark:bg-slate-900/95 text-on-surface p-3.5 shadow-2xl border border-outline-variant/40 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-300 ${
            isMemberApp
              ? 'bottom-[calc(5.2rem+env(safe-area-inset-bottom,0px))] sm:bottom-6'
              : 'bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:bottom-6'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-orange-600 to-red-600 text-white shadow-md shadow-orange-500/25">
              <span className="material-symbols-outlined text-2xl">install_mobile</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <h4 className="text-xs font-black text-on-surface tracking-tight">Install TFHC-ORDERLINESS</h4>
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
              <p className="text-[11px] text-on-surface-variant line-clamp-1 mt-0.5 font-medium">
                {isIos
                  ? 'Add to Home Screen for voice calls & notifications'
                  : isAndroid
                  ? 'Install on your phone for instant calls & alerts'
                  : 'Install app for instant messaging & voice calls'}
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
                    if (installRef.current) {
                      try {
                        await installRef.current.prompt();
                        await installRef.current.userChoice;
                      } catch { /* dismissed */ }
                      setInstall(null);
                    } else {
                      setShowInstallModal(true);
                    }
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-600 to-red-600 hover:opacity-95 active:scale-95 text-white font-extrabold text-[11px] shadow-sm shadow-orange-500/30 transition-all cursor-pointer uppercase tracking-wider"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  <span>{install ? 'INSTALL NOW' : isIos ? 'HOW TO INSTALL' : 'INSTALL APP'}</span>
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

      {/* Universal Installation Instruction Modal (Android, iOS, Desktop) */}
      {showInstallModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-modal-title"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setShowInstallModal(false)}
        >
          <div
            className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 p-5 sm:p-6 text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-orange-500 to-red-600 text-white shadow-xs">
                  <span className="material-symbols-outlined text-xl">install_mobile</span>
                </div>
                <div>
                  <h3 id="install-modal-title" className="text-base font-black tracking-tight leading-tight">Install TFHC App</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Quick setup on your device</p>
                </div>
              </div>
              <button
                onClick={() => setShowInstallModal(false)}
                className="rounded-full p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Platform Selection Tabs */}
            <div className="mt-3 flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 shrink-0 text-xs font-bold">
              <button
                type="button"
                onClick={() => setInstallModalTab('android')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-center transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  installModalTab === 'android'
                    ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-sm">android</span>
                <span>Android</span>
              </button>
              <button
                type="button"
                onClick={() => setInstallModalTab('ios')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-center transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  installModalTab === 'ios'
                    ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-sm">phone_iphone</span>
                <span>iPhone/iPad</span>
              </button>
              <button
                type="button"
                onClick={() => setInstallModalTab('desktop')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-center transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  installModalTab === 'desktop'
                    ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-sm">laptop</span>
                <span>Desktop</span>
              </button>
            </div>

            {/* Tab 1: Android Instructions */}
            {installModalTab === 'android' && (
              <div className="mt-4 space-y-3.5 text-xs text-slate-600 dark:text-slate-300">
                <div className="p-3 rounded-2xl bg-orange-50/70 dark:bg-orange-950/30 border border-orange-200/50 dark:border-orange-900/40 text-[11px] text-orange-900 dark:text-orange-300 font-medium">
                  {installRef.current ? (
                    <div className="flex flex-col gap-2">
                      <span>Chrome is ready to install the app directly:</span>
                      <button
                        type="button"
                        onClick={async () => {
                          if (installRef.current) {
                            try {
                              await installRef.current.prompt();
                              await installRef.current.userChoice;
                            } catch {}
                            setInstall(null);
                            setShowInstallModal(false);
                          }
                        }}
                        className="py-2 px-3 rounded-xl bg-orange-600 text-white font-extrabold text-xs shadow-xs text-center active:scale-95 transition-all"
                      >
                        Tap to Install Immediately
                      </button>
                    </div>
                  ) : (
                    <span>If the automatic prompt hasn&apos;t appeared yet, install manually in 3 seconds:</span>
                  )}
                </div>

                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400 font-extrabold">1</span>
                  <p className="pt-0.5">
                    Tap the <strong className="text-slate-900 dark:text-white">three dots menu (⋮)</strong> in the top right corner of Chrome or your browser.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400 font-extrabold">2</span>
                  <p className="pt-0.5">
                    Select <strong className="text-slate-900 dark:text-white">&ldquo;Install app&rdquo;</strong> (or <strong className="text-slate-900 dark:text-white">&ldquo;Add to Home screen&rdquo;</strong>) <span className="material-symbols-outlined align-middle text-sm text-orange-500">add_to_home_screen</span>.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400 font-extrabold">3</span>
                  <p className="pt-0.5">
                    Tap <strong className="text-slate-900 dark:text-white">&ldquo;Install&rdquo;</strong> in the confirmation dialog. The app will be added to your home screen and app launcher.
                  </p>
                </div>
              </div>
            )}

            {/* Tab 2: iPhone / iPad Instructions */}
            {installModalTab === 'ios' && (
              <div className="mt-4 space-y-3.5 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 font-extrabold">1</span>
                  <p className="pt-0.5">
                    In Safari or Chrome, tap the <strong className="text-slate-900 dark:text-white">Share</strong> icon <span className="material-symbols-outlined align-middle text-sm text-blue-500">ios_share</span> in the bottom toolbar.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 font-extrabold">2</span>
                  <p className="pt-0.5">
                    Scroll down the share sheet and select <strong className="text-slate-900 dark:text-white">&ldquo;Add to Home Screen&rdquo;</strong> <span className="material-symbols-outlined align-middle text-sm text-blue-500">add_box</span>.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 font-extrabold">3</span>
                  <p className="pt-0.5">
                    Tap <strong className="text-slate-900 dark:text-white">&ldquo;Add&rdquo;</strong> in the top right corner. TFHC-ORDERLINESS will appear as a standalone app on your home screen.
                  </p>
                </div>
              </div>
            )}

            {/* Tab 3: Desktop Instructions */}
            {installModalTab === 'desktop' && (
              <div className="mt-4 space-y-3.5 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 font-extrabold">1</span>
                  <p className="pt-0.5">
                    Look for the <strong className="text-slate-900 dark:text-white">Install icon (⊕)</strong> on the right side of the browser address bar.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 font-extrabold">2</span>
                  <p className="pt-0.5">
                    Or click the browser menu (<strong className="text-slate-900 dark:text-white">⋮</strong>) &rarr; <strong className="text-slate-900 dark:text-white">&ldquo;Save and share&rdquo;</strong> &rarr; <strong className="text-slate-900 dark:text-white">&ldquo;Install TFHC Orderliness&rdquo;</strong>.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 font-extrabold">3</span>
                  <p className="pt-0.5">
                    Click <strong className="text-slate-900 dark:text-white">&ldquo;Install&rdquo;</strong> to launch as a native desktop window.
                  </p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowInstallModal(false)}
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
