'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '../../../../../components/Navbar';
import { Badge, Button, EmptyState, Field, Modal, PageHeader, Spinner, inputClass, useToast } from '../../../../../components/ui';
import { fetchApi, ApiError } from '../../../../../lib/api';
import { useAuth } from '../../../../../lib/auth';

const naira = (n: number) => `₦${Math.round(n).toLocaleString()}`;
const METHODS = ['CASH', 'BANK_TRANSFER', 'POS', 'CHEQUE', 'ONLINE', 'OTHER'];

interface Expense {
  id: string;
  reference: string;
  title: string;
  amount: number;
  incurredOn: string;
  vendorName: string | null;
  status: string;
  category: { id: string; name: string } | null;
  createdBy: string | null;
  rejectionReason: string | null;
}

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  DRAFT: 'neutral',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'info',
  REJECTED: 'danger',
  PAID: 'success',
  CANCELLED: 'neutral',
};

export default function ExpensesPage() {
  const { can, loading: authLoading } = useAuth();
  const { notify } = useToast();
  const [rows, setRows] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [payTarget, setPayTarget] = useState<Expense | null>(null);
  const [busy, setBusy] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (status) q.set('status', status);
      const [e, c] = await Promise.all([
        fetchApi<Expense[]>(`/finance/expenses?${q}`),
        fetchApi<{ id: string; name: string }[]>('/finance/expense-categories').catch(() => []),
      ]);
      setRows(e);
      setCategories(c);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? 'You do not have access to expenses.' : 'Could not load expenses.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!authLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, status]);

  const act = async (id: string, path: string, ok: string) => {
    setBusy(id);
    try {
      await fetchApi(`/finance/expenses/${id}/${path}`, { method: 'POST', body: '{}' });
      notify(ok, 'success');
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Action failed', 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        <nav className="text-xs text-on-surface-variant">
          <Link href="/admin/finance" className="hover:text-primary">Finance</Link>
          <span className="mx-1.5">/</span>
          <span className="text-on-surface">Expenses</span>
        </nav>
        <PageHeader
          title="Expenses"
          subtitle="Expenditure with a two-level approval before payment."
          actions={can('expenses.create') ? <Button onClick={() => setCreating(true)}>+ New expense</Button> : undefined}
        />

        <select className={`${inputClass} w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.keys(TONE).map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>

        {loading ? (
          <div className="flex justify-center py-16 text-on-surface-variant"><Spinner /></div>
        ) : error ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={load}>Retry</Button>} />
        ) : rows.length === 0 ? (
          <EmptyState title="No expenses" action={can('expenses.create') ? <Button onClick={() => setCreating(true)}>+ New expense</Button> : undefined} />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm">
            <table className="w-full min-w-[42rem] text-sm">
              <thead className="border-b border-outline-variant/20 bg-surface-container-low/60 text-left text-xs uppercase tracking-wide text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3 font-semibold">Expense</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15">
                {rows.map((x) => (
                  <tr key={x.id}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-on-surface">{x.title}</div>
                      <div className="text-xs text-on-surface-variant">
                        <span className="font-mono">{x.reference}</span> · {x.category?.name} · {new Date(x.incurredOn).toLocaleDateString()}
                        {x.vendorName ? ` · ${x.vendorName}` : ''}
                      </div>
                      {x.rejectionReason && <div className="text-xs text-error">{x.rejectionReason}</div>}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-on-surface">{naira(x.amount)}</td>
                    <td className="px-4 py-2.5"><Badge tone={TONE[x.status] ?? 'neutral'}>{x.status.replace('_', ' ')}</Badge></td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        {can('expenses.create') && ['DRAFT', 'REJECTED'].includes(x.status) && (
                          <Button variant="ghost" className="text-xs" loading={busy === x.id} onClick={() => act(x.id, 'submit', 'Submitted for approval')}>Submit</Button>
                        )}
                        {can('expenses.approve') && x.status === 'APPROVED' && (
                          <Button variant="ghost" className="text-xs text-tertiary" onClick={() => setPayTarget(x)}>Mark paid</Button>
                        )}
                        {can('expenses.delete') && !['PAID', 'CANCELLED'].includes(x.status) && (
                          <Button variant="ghost" className="text-xs text-error" loading={busy === x.id} onClick={() => act(x.id, 'cancel', 'Expense cancelled')}>Cancel</Button>
                        )}
                        {x.status === 'PENDING_APPROVAL' && (
                          <Link href="/admin/approvals"><Button variant="ghost" className="text-xs">In review</Button></Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {creating && (
        <ExpenseModal
          categories={categories}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            notify('Expense created', 'success');
            load();
          }}
        />
      )}
      {payTarget && (
        <PayModal
          expense={payTarget}
          onClose={() => setPayTarget(null)}
          onDone={() => {
            setPayTarget(null);
            notify('Marked as paid', 'success');
            load();
          }}
        />
      )}
    </div>
  );
}

function ExpenseModal({ categories, onClose, onDone }: { categories: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const { notify } = useToast();
  const [form, setForm] = useState({ title: '', categoryId: categories[0]?.id ?? '', amount: '', incurredOn: '', vendorName: '', description: '' });
  const [submit, setSubmit] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const go = async () => {
    setErr('');
    if (form.title.trim().length < 2 || !form.categoryId || !form.amount || !form.incurredOn) return setErr('Fill in the required fields.');
    setSaving(true);
    try {
      await fetchApi('/finance/expenses', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          categoryId: form.categoryId,
          amount: Number(form.amount),
          incurredOn: form.incurredOn,
          vendorName: form.vendorName.trim() || undefined,
          description: form.description.trim() || undefined,
          submit,
        }),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the expense.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New expense"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={go} loading={saving}>{submit ? 'Create & submit' : 'Save draft'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title" required><input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" required>
            <select className={inputClass} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </Field>
          <Field label="Amount (₦)" required><input type="number" className={inputClass} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Date incurred" required><input type="date" className={inputClass} value={form.incurredOn} onChange={(e) => setForm({ ...form, incurredOn: e.target.value })} /></Field>
          <Field label="Vendor / payee"><input className={inputClass} value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} maxLength={200} /></Field>
        </div>
        <Field label="Description"><textarea className={inputClass} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={4000} /></Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 rounded border-outline-variant text-primary" checked={submit} onChange={(e) => setSubmit(e.target.checked)} />
          Submit for approval now
        </label>
        {err && <p role="alert" className="text-sm font-medium text-error">{err}</p>}
      </div>
    </Modal>
  );
}

function PayModal({ expense, onClose, onDone }: { expense: Expense; onClose: () => void; onDone: () => void }) {
  const { notify } = useToast();
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Mark ${expense.reference} paid`}
      description={`${expense.title} — ₦${expense.amount.toLocaleString()}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await fetchApi(`/finance/expenses/${expense.id}/pay`, { method: 'POST', body: JSON.stringify({ paymentMethod: method, paymentReference: reference.trim() || undefined, paidOn: paidOn || undefined }) });
                onDone();
              } catch (e) {
                notify(e instanceof Error ? e.message : 'Could not mark paid', 'error');
              } finally {
                setSaving(false);
              }
            }}
          >
            Confirm payment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Payment method">
          <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => (<option key={m} value={m}>{m.replace('_', ' ')}</option>))}
          </select>
        </Field>
        <Field label="Reference / transaction ID"><input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} /></Field>
        <Field label="Payment date"><input type="date" className={inputClass} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
