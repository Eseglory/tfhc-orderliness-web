'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '../../../../../components/Navbar';
import { Badge, Button, ConfirmDialog, EmptyState, Field, Modal, PageHeader, Spinner, inputClass, useToast } from '../../../../../components/ui';
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        <nav className="text-xs text-on-surface-variant">
          <Link href="/admin/finance" className="hover:text-primary">Finance</Link>
          <span className="mx-1.5">/</span>
          <span className="text-on-surface">Payment Accounts</span>
        </nav>
        <PageHeader
          title="Payment Accounts"
          subtitle="The bank details members see when making a payment."
          actions={manage ? <Button onClick={() => setEditing('new')}>+ Add account</Button> : undefined}
        />

        {loading ? (
          <div className="flex justify-center py-16 text-on-surface-variant"><Spinner /></div>
        ) : error ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={load}>Retry</Button>} />
        ) : rows.length === 0 ? (
          <EmptyState title="No accounts configured" description="Members will have no bank details to pay into." action={manage ? <Button onClick={() => setEditing('new')}>+ Add account</Button> : undefined} />
        ) : (
          <div className="space-y-3">
            {rows.map((a) => (
              <article key={a.id} className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-on-surface">{a.bankName}</span>
                      {a.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Hidden</Badge>}
                    </div>
                    <p className="mt-0.5 text-sm text-on-surface">{a.accountName}</p>
                    <p className="font-mono text-sm text-on-surface-variant">{a.accountNumber}</p>
                    {a.instructions && <p className="mt-1 text-xs text-on-surface-variant">{a.instructions}</p>}
                  </div>
                  {manage && (
                    <div className="flex gap-1">
                      <Button variant="ghost" className="text-xs" onClick={() => setEditing(a)}>Edit</Button>
                      <Button variant="ghost" className="text-xs text-error" onClick={() => setDeleting(a)}>Delete</Button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

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
    </div>
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
