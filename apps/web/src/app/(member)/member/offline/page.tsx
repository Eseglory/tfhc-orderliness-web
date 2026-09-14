'use client';
import Link from 'next/link';
import { OfflineStorage } from '../../../../components/OfflineStorage';
import { PushSettings } from '../../../../components/PushSettings';
export default function OfflinePage() {
  return <main className="max-w-3xl mx-auto p-5 pb-28 space-y-5">
    <Link href="/member" className="underline">Home</Link>
    <h1 className="text-2xl font-bold">Offline and device settings</h1>
    <section className="rounded-xl bg-surface-container p-4 space-y-2" aria-label="Install the app">
      <h2 className="font-bold">Install TFHC Tracker</h2>
      <p>Use the Install app button when it appears. On iPhone or iPad, open this site in Safari, tap Share, then Add to Home Screen. Other browsers may offer Install app in their menu.</p>
    </section>
    <OfflineStorage />
    <PushSettings />
    <Link className="underline inline-block min-h-11" href="/member/files">Review shared files</Link>
    <p>Check-ins, payments and approvals require a live connection. Drafts are saved locally until you review and submit them. Background notification reads run when your browser supports background sync; other browsers retry when the app reopens.</p>
  </main>;
}
