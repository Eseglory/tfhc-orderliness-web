'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Landmark,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  EyeOff,
  Copy,
  RefreshCw,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../../components/admin/AdminLayoutShell';
import { Badge, Button, ConfirmDialog, EmptyState, Field, Modal, Spinner, inputClass, useToast } from '../../../../../components/ui';
import { fetchApi, ApiError } from '../../../../../lib/api';
import { useAuth } from '../../../../../lib/auth';

interface Account {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  instructions: string | null;
  isActive: boolean;
  sortOrder: number;
}

export default function PaymentAccountsPage() {
  const { can, loading: authLoading } = useAuth();
  const { notify } = useToast();
  const [rows, setRows] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);
  const manage = can('payments.configure');

  const load = async () => {
    setLoading(true);
    try {
      setRows(await fetchApi<Account[]>('/finance/payment-accounts'));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? 'You do not have access to payment accounts.' : 'Could not load accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading]);

  const copyAccount = (num: string) => {
    navigator.clipboard.writeText(num);
    notify('Account number copied to clipboard', 'success');
  };

  return (
    <AdminLayoutShell activeHref="/admin/finance">
      <div className="space-y-6 pb-16">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <Link href="/admin/finance" className="hover:text-indigo-600 transition-colors">FINANCE</Link>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">BANK ACCOUNTS</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Payment &amp; Receiving Accounts
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configure treasury receiving accounts displayed to members during payment checkout.
            </p>
          </div>

          {manage && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditing('new')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                Add Bank Account
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-24 text-slate-400"><Spinner /></div>
        ) : error ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={load}>Retry</Button>} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No Payment Accounts Configured"
            description="Members currently will not see any bank accounts to transfer dues into."
            action={manage ? <Button onClick={() => setEditing('new')}>+ Add Account</Button> : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map((a) => (
              <article
                key={a.id}
                className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                        <Landmark className="w-4 h-4" />
                      </div>
                      <span className="font-extrabold text-slate-900 dark:text-white text-sm">{a.bankName}</span>
                    </div>
                    {a.isActive ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="neutral">Hidden</Badge>
                    )}
                  </div>

                  <div>
                    <p className="text-xs text-slate-400 font-medium">Account Name</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{a.accountName}</p>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Account Number</p>
                      <p className="font-mono text-base font-black text-slate-900 dark:text-white tracking-widest">{a.accountNumber}</p>
                    </div>
                    <button
                      onClick={() => copyAccount(a.accountNumber)}
                      className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                      title="Copy account number"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>

                  {a.instructions && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 bg-amber-50/50 dark:bg-amber-950/30 p-2.5 rounded-xl border border-amber-100/50 dark:border-amber-900/30">
                      <span className="font-bold text-amber-700 dark:text-amber-400">Note: </span>
                      {a.instructions}
                    </p>
                  )}
                </div>

                {manage && (
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-end gap-2">
                    <button
                      onClick={() => setEditing(a)}
                      className="px-2.5 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleting(a)}
                      className="px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <AccountModal
          account={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            notify('Saved', 'success');
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.bankName}?`}
        body="Members will no longer see this account."
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await fetchApi(`/finance/payment-accounts/${deleting.id}`, { method: 'DELETE' });
            notify('Deleted', 'success');
            setDeleting(null);
            load();
          } catch (e) {
            notify(e instanceof Error ? e.message : 'Could not delete', 'error');
          }
        }}
      />
    </AdminLayoutShell>
  );
}

function AccountModal({ account, onClose, onDone }: { account: Account | null; onClose: () => void; onDone: () => void }) {
  const { notify } = useToast();
  const [form, setForm] = useState({
    bankName: account?.bankName ?? '',
    accountName: account?.accountName ?? '',
    accountNumber: account?.accountNumber ?? '',
    instructions: account?.instructions ?? '',
    isActive: account?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    setSaving(true);
    try {
      const body = JSON.stringify(form);
      if (account) await fetchApi(`/finance/payment-accounts/${account.id}`, { method: 'PATCH', body });
      else await fetchApi('/finance/payment-accounts', { method: 'POST', body });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={account ? 'Edit account' : 'Add payment account'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Bank name" required><input className={inputClass} value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} maxLength={120} /></Field>
        <Field label="Account name" required><input className={inputClass} value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} maxLength={160} /></Field>
        <Field label="Account number" required><input className={inputClass} value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} maxLength={20} /></Field>
        <Field label="Payment instructions"><textarea className={inputClass} rows={2} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} maxLength={1000} placeholder="e.g. Use your member code as the transfer narration" /></Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 rounded border-outline-variant text-primary" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          Show to members
        </label>
        {err && <p role="alert" className="text-sm font-medium text-error">{err}</p>}
      </div>
    </Modal>
  );
}
