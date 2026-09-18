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
      setPassphrase('');
      setMessage(action === 'clear' ? 'Saved device data removed. Reconnect to set it up again.' : action === 'lock' ? 'Offline storage locked.' : 'Offline storage unlocked for this tab.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Offline storage unavailable.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-4 shadow-sm" aria-label="Encrypted offline storage">
      <div className="flex items-center gap-2.5">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <span className="material-symbols-outlined text-xl">security</span>
        </div>
        <div>
          <h2 className="font-bold text-base text-primary">Encrypted Offline Storage</h2>
          <p className="text-xs text-on-surface-variant">Save schedules, documents, and form drafts on this device.</p>
        </div>
      </div>

      <p className="text-xs text-on-surface-variant leading-relaxed">
        Choose a separate offline passphrase of at least 12 characters; it is encrypted locally and never sent to the server.
      </p>

      <div className="space-y-1.5">
        <label className="block text-xs font-bold text-on-surface" htmlFor="offline-passphrase-input">
          Offline Passphrase (Min. 12 characters)
        </label>
        <input
          id="offline-passphrase-input"
          type="password"
          autoComplete="off"
          minLength={12}
          value={passphrase}
          onChange={event => setPassphrase(event.target.value)}
          placeholder="Enter secret passphrase..."
          className="block w-full rounded-xl border border-outline-variant/40 bg-surface p-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-mono"
        />
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          disabled={busy || passphrase.length < 12}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-bold shadow-xs hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
          onClick={() => run('configure')}
        >
          <span className="material-symbols-outlined text-sm">settings</span>
          <span>Set Up Offline Storage</span>
        </button>

        <button
          disabled={busy || passphrase.length < 12}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-xs hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-50"
          onClick={() => run('unlock')}
        >
          <span className="material-symbols-outlined text-sm">lock_open</span>
          <span>Unlock</span>
        </button>

        <button
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-surface-container-low text-on-surface border border-outline-variant/30 text-xs font-semibold hover:border-primary active:scale-95 transition-all disabled:opacity-50"
          onClick={() => run('lock')}
        >
          <span className="material-symbols-outlined text-sm">lock</span>
          <span>Lock</span>
        </button>

        <button
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-semibold hover:bg-rose-100 active:scale-95 transition-all disabled:opacity-50"
          onClick={() => {
            if (window.confirm('Delete all saved schedules, drafts, pending reads and files from this device?')) {
              void run('clear');
            }
          }}
        >
          <span className="material-symbols-outlined text-sm">delete_forever</span>
          <span>Clear Device Data</span>
        </button>
      </div>

      {message && (
        <p role="status" className="text-xs font-semibold text-primary bg-primary/10 p-2.5 rounded-xl border border-primary/20">
          {message}
        </p>
      )}

      <div className="pt-2 border-t border-outline-variant/20 flex justify-end">
        <a
          href="/offline.html"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-container-low text-primary border border-outline-variant/30 text-xs font-bold hover:bg-surface-container transition-all active:scale-95"
        >
          <span className="material-symbols-outlined text-base">offline_pin</span>
          <span>Open Offline Workspace</span>
        </a>
      </div>
    </section>
  );
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
        setRevision(await store.save(name, value, revision ?? 0));
        setMessage('Draft saved locally on this device.');
      } else if (action === 'restore') {
        const row = await store.read(name);
        if (!row) throw new Error('No saved draft found.');
        restore(row.value);
        setRevision(row.revision);
        setMessage('Draft restored successfully.');
      } else {
        await store.deleteRecord(name);
        setRevision(undefined);
        setMessage('Saved draft deleted.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Draft could not be processed.');
    }
  }

  return (
    <div className="text-xs rounded-2xl bg-surface-container-low border border-outline-variant/20 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1">
          <span className="material-symbols-outlined text-sm">edit_note</span>
          <span>Local Draft Controls</span>
        </span>
        <Link href="/member/offline" className="text-[11px] font-bold text-primary hover:underline flex items-center gap-0.5">
          <span>Offline Settings</span>
          <span className="material-symbols-outlined text-xs">chevron_right</span>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => run('save')}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-surface-container-lowest text-on-surface border border-outline-variant/30 text-xs font-bold hover:border-primary hover:text-primary active:scale-95 transition-all shadow-xs"
        >
          <span className="material-symbols-outlined text-[15px]">save</span>
          <span>Save Draft</span>
        </button>

        <button
          type="button"
          onClick={() => run('restore')}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-surface-container-lowest text-on-surface border border-outline-variant/30 text-xs font-bold hover:border-primary hover:text-primary active:scale-95 transition-all shadow-xs"
        >
          <span className="material-symbols-outlined text-[15px]">history</span>
          <span>Restore Draft</span>
        </button>

        <button
          type="button"
          onClick={() => run('delete')}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-semibold hover:bg-rose-100 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-[15px]">delete</span>
          <span>Delete Draft</span>
        </button>
      </div>

      {message && (
        <p role="status" className="text-[11px] font-semibold text-primary">
          {message}
        </p>
      )}
    </div>
  );
}
