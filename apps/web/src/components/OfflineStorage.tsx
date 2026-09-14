'use client';
import { useState } from 'react';
import Link from 'next/link';
import { pwaRuntime } from '../lib/pwa/runtime';
export function OfflineStorage() {
  const [passphrase, setPassphrase] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(action: 'configure' | 'unlock' | 'lock' | 'clear') {
    setBusy(true);
    try {
      const store = await pwaRuntime();
      if (action === 'configure') await store.configure(passphrase);
      if (action === 'unlock') await store.unlock(passphrase);
      if (action === 'lock') store.lock();
      if (action === 'clear') { await store.clearPrivate(); window.dispatchEvent(new Event('tfhc:offline-cleared')); }
      setPassphrase(''); setMessage(action === 'clear' ? 'Saved device data removed. Reconnect to set it up again.' : action === 'lock' ? 'Offline storage locked.' : 'Offline storage unlocked for this tab.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Offline storage unavailable.'); }
    finally { setBusy(false); }
  }
  return <section className="rounded-xl bg-surface-container p-4 space-y-3" aria-label="Encrypted offline storage">
    <h2 className="font-bold">Offline storage</h2>
    <p>Save schedules and drafts on this device. Choose a separate offline passphrase; it is never sent to the server. Saved content expires after seven days, and offline access must be renewed online each day.</p>
    <label className="block">Offline passphrase
      <input type="password" autoComplete="off" minLength={12} value={passphrase} onChange={event => setPassphrase(event.target.value)} className="block w-full rounded border border-outline p-3 bg-background" />
    </label>
    <div className="flex flex-wrap gap-3">
      <button disabled={busy || passphrase.length < 12} className="min-h-11 underline disabled:opacity-50" onClick={() => run('configure')}>Set up offline storage</button>
      <button disabled={busy || passphrase.length < 12} className="min-h-11 underline disabled:opacity-50" onClick={() => run('unlock')}>Unlock</button>
      <button disabled={busy} className="min-h-11 underline" onClick={() => run('lock')}>Lock</button>
      <button disabled={busy} className="min-h-11 underline" onClick={() => { if (window.confirm('Delete all saved schedules, drafts, pending reads and files from this device?')) void run('clear'); }}>Clear device data</button>
    </div>
    <p role="status">{message}</p>
    <a href="/offline.html" className="underline inline-block min-h-11">Open offline workspace</a>
  </section>;
}
export function DraftControls({ name, value, restore }: { name: string; value: unknown; restore(value: any): void }) {
  const [revision, setRevision] = useState<number | undefined>(undefined);
  const [message, setMessage] = useState('');
  async function run(action: 'save' | 'restore' | 'delete') {
    try {
      const store = await pwaRuntime();
      if (action === 'save') {
        // Never overwrite an existing draft before loading its revision.
        const old = await store.read(name);
        if (old && revision === undefined) throw new Error('A saved draft exists. Restore it first to avoid overwriting changes.');
        setRevision(await store.save(name, value, revision ?? 0)); setMessage('Draft saved on this device. It has not been submitted.');
      } else if (action === 'restore') {
        const row = await store.read(name);
        if (!row) throw new Error('No saved draft.');
        restore(row.value); setRevision(row.revision); setMessage('Draft restored. Review it before submitting.');
      } else { await store.deleteRecord(name); setRevision(undefined); setMessage('Saved draft deleted.'); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Draft could not be saved.'); }
  }
  return <div className="text-sm rounded-lg bg-surface-container p-3 space-y-2">
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={() => run('save')} className="min-h-11 underline">Save draft</button>
      <button type="button" onClick={() => run('restore')} className="min-h-11 underline">Restore draft</button>
      <button type="button" onClick={() => run('delete')} className="min-h-11 underline">Delete draft</button>
      <Link href="/member/offline" className="min-h-11 inline-flex items-center underline">Offline settings</Link>
    </div>
    <p role="status">{message}</p>
  </div>;
}
