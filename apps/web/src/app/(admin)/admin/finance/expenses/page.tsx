'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Receipt,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingDown,
  DollarSign,
  ChevronRight,
  Send,
  XCircle,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../../components/admin/AdminLayoutShell';
import { Badge, Button, EmptyState, Field, Modal, Spinner, inputClass, useToast } from '../../../../../components/ui';
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

  const stats = useMemo(() => {
    const totalAmount = rows.reduce((acc, x) => acc + (x.status === 'PAID' ? x.amount : 0), 0);
    const pendingCount = rows.filter((x) => x.status === 'PENDING_APPROVAL').length;
    const approvedUnpaid = rows.filter((x) => x.status === 'APPROVED').length;
    return { totalAmount, pendingCount, approvedUnpaid };
  }, [rows]);

  return (
    <AdminLayoutShell activeHref="/admin/finance">
      <div className="space-y-6 pb-16">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <Link href="/admin/finance" className="hover:text-indigo-600 transition-colors">FINANCE</Link>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">EXPENSES</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Ministry Expenses &amp; Disbursements
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Expenditure requests with governance oversight and multi-level approval before payout.
            </p>
          </div>

          {can('expenses.create') && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCreating(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                New Expense
              </button>
            </div>
          )}
        </div>

        {/* 3 Metric KPI Cards */}
        <div className="flex overflow-x-auto no-scrollbar sm:grid sm:grid-cols-3 gap-4 pb-1 sm:pb-0">
          <div className="min-w-[220px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Awaiting Approval</span>
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{stats.pendingCount}</p>
            <p className="mt-1 text-xs text-slate-500">Submitted for oversight review</p>
          </div>

          <div className="min-w-[220px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Approved (Unpaid)</span>
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{stats.approvedUnpaid}</p>
            <p className="mt-1 text-xs text-slate-500">Ready for treasury payout</p>
          </div>

          <div className="min-w-[220px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Total Disbursed</span>
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{naira(stats.totalAmount)}</p>
            <p className="mt-1 text-xs text-slate-500">Paid out expenses</p>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              className="px-3 py-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              {Object.keys(TONE).map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <span className="text-xs text-slate-400 font-bold">{rows.length} expenses</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-24 text-slate-400"><Spinner /></div>
        ) : error ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={load}>Retry</Button>} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No Expenses Found"
            description="Create a new expense entry or adjust your status filter."
            action={can('expenses.create') ? <Button onClick={() => setCreating(true)}>+ New Expense</Button> : undefined}
          />
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Expense Details</th>
                    <th className="px-4 py-3.5">Amount</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {rows.map((x) => (
                    <tr key={x.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900 dark:text-white">{x.title}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">{x.reference}</span> · {x.category?.name ?? 'General'} · {new Date(x.incurredOn).toLocaleDateString()}
                          {x.vendorName ? ` · ${x.vendorName}` : ''}
                        </div>
                        {x.rejectionReason && <div className="text-[11px] text-rose-500 font-semibold mt-1">Rejection: {x.rejectionReason}</div>}
                      </td>
                      <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-white text-sm">{naira(x.amount)}</td>
                      <td className="px-4 py-3.5">
                        <Badge tone={TONE[x.status] ?? 'neutral'}>{x.status.replace('_', ' ')}</Badge>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex justify-end gap-1">
                          {can('expenses.create') && ['DRAFT', 'REJECTED'].includes(x.status) && (
                            <button
                              disabled={busy === x.id}
                              className="px-2.5 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-colors"
                              onClick={() => act(x.id, 'submit', 'Submitted for approval')}
                            >
                              Submit
                            </button>
                          )}
                          {can('expenses.approve') && x.status === 'APPROVED' && (
                            <button
                              className="px-2.5 py-1 text-xs font-bold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg transition-colors"
                              onClick={() => setPayTarget(x)}
                            >
                              Mark Paid
                            </button>
                          )}
                          {can('expenses.delete') && !['PAID', 'CANCELLED'].includes(x.status) && (
                            <button
                              disabled={busy === x.id}
                              className="px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors"
                              onClick={() => act(x.id, 'cancel', 'Expense cancelled')}
                            >
                              Cancel
                            </button>
                          )}
                          {x.status === 'PENDING_APPROVAL' && (
                            <Link
                              href="/admin/approvals"
                              className="px-2.5 py-1 text-xs font-bold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded-lg transition-colors"
                            >
                              In Review →
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

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
    </AdminLayoutShell>
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
