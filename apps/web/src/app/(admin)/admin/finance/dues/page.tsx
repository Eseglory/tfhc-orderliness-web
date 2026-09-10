'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CreditCard,
  Plus,
  Upload,
  Search,
  Filter,
  RefreshCw,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Users,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../../components/admin/AdminLayoutShell';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  Spinner,
  inputClass,
  useToast,
} from '../../../../../components/ui';
import { fetchApi, ApiError } from '../../../../../lib/api';
import { useAuth } from '../../../../../lib/auth';

const naira = (n: number) => `₦${Math.round(n).toLocaleString()}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface Period {
  id: string;
  year: number;
  month: number;
  label: string;
  defaultAmount: number;
  dueDate: string;
  status: string;
  assignmentCount: number;
}
interface Assignment {
  id: string;
  member: { id: string; name: string; memberCode: string; subTeam: string | null };
  amountDue: number;
  amountPaid: number;
  balance: number;
  status: string;
  storedStatus: string;
  note: string | null;
}
interface PeriodDetail {
  period: { id: string; label: string; defaultAmount: number; dueDate: string; status: string };
  summary: {
    members: number;
    expected: number;
    collected: number;
    outstanding: number;
    collectionRate: number;
    paid: number;
    partiallyPaid: number;
    outstandingCount: number;
    overdue: number;
    exempt: number;
  };
  assignments: Assignment[];
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  PAID: 'success',
  PARTIALLY_PAID: 'warning',
  OUTSTANDING: 'info',
  OVERDUE: 'danger',
  EXEMPT: 'neutral',
  WAIVED: 'neutral',
};

export default function DuesPage() {
  const { can, loading: authLoading } = useAuth();
  const { notify } = useToast();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<PeriodDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editAssignment, setEditAssignment] = useState<Assignment | null>(null);

  const canManage = can('dues.create') || can('dues.update');

  const loadPeriods = async () => {
    setLoading(true);
    try {
      const rows = await fetchApi<Period[]>('/finance/dues/periods');
      setPeriods(rows);
      if (!selected && rows[0]) setSelected(rows[0].id);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? 'You do not have access to dues.' : 'Could not load dues.');
    } finally {
      setLoading(false);
    }
  };
  const loadDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      setDetail(await fetchApi<PeriodDetail>(`/finance/dues/periods/${id}`));
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) loadPeriods();
  }, [authLoading]);

  useEffect(() => {
    if (selected) loadDetail(selected);
  }, [selected]);

  const rows = useMemo(() => {
    if (!detail) return [];
    return detail.assignments.filter((a) => {
      if (statusFilter && a.status !== statusFilter) return false;
      if (search.trim() && !`${a.member.name} ${a.member.memberCode}`.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [detail, statusFilter, search]);

  return (
    <AdminLayoutShell activeHref="/admin/finance">
      <div className="space-y-6 pb-16">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <Link href="/admin/finance" className="hover:text-indigo-600 transition-colors">FINANCE</Link>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">MONTHLY DUES</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Monthly Dues Management
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Per-member dues, collection tracking, and arrears management across months.
            </p>
          </div>

          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setImporting(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
              >
                <Upload className="w-3.5 h-3.5 text-slate-400" />
                Import Matrix
              </button>
              {can('dues.create') && (
                <button
                  onClick={() => setCreating(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
                >
                  <Plus className="w-4 h-4" />
                  New Period
                </button>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-24 text-slate-400"><Spinner /></div>
        ) : error ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={loadPeriods}>Retry</Button>} />
        ) : periods.length === 0 ? (
          <EmptyState
            title="No Dues Periods Yet"
            description="Create a period (or import the spreadsheet matrix) to start tracking collections."
            action={can('dues.create') ? <Button onClick={() => setCreating(true)}>+ New Period</Button> : undefined}
          />
        ) : (
          <>
            {/* Horizontal Period Selector Ribbon */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {periods.map((p) => {
                const isSelected = selected === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p.id)}
                    className={`whitespace-nowrap px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <span>{p.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                      {p.assignmentCount}
                    </span>
                  </button>
                );
              })}
            </div>

            {detailLoading || !detail ? (
              <div className="flex justify-center py-24 text-slate-400"><Spinner /></div>
            ) : (
              <>
                {/* 5 Metric KPI Cards - Swipeable on mobile */}
                <div className="flex overflow-x-auto no-scrollbar sm:grid sm:grid-cols-2 lg:grid-cols-5 gap-3.5 pb-1 sm:pb-0">
                  <div className="min-w-[180px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Expected</p>
                    <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">{naira(detail.summary.expected)}</p>
                  </div>
                  <div className="min-w-[180px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Collected</p>
                    <p className="mt-1 text-xl font-black text-emerald-600">{naira(detail.summary.collected)}</p>
                  </div>
                  <div className="min-w-[180px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Outstanding</p>
                    <p className={`mt-1 text-xl font-black ${detail.summary.outstanding > 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>
                      {naira(detail.summary.outstanding)}
                    </p>
                  </div>
                  <div className="min-w-[180px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Collection Rate</p>
                    <p className="mt-1 text-xl font-black text-indigo-600 dark:text-indigo-400">{detail.summary.collectionRate}%</p>
                  </div>
                  <div className="min-w-[180px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Overdue</p>
                    <p className={`mt-1 text-xl font-black ${detail.summary.overdue > 0 ? 'text-amber-600' : 'text-slate-900 dark:text-white'}`}>
                      {detail.summary.overdue} <span className="text-xs font-normal text-slate-400">members</span>
                    </p>
                  </div>
                </div>

                {/* Filter and Search Bar */}
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                      placeholder="Search member name or code…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <select
                      className="px-3 py-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <option value="">All Statuses</option>
                      {['PAID', 'PARTIALLY_PAID', 'OUTSTANDING', 'OVERDUE', 'EXEMPT', 'WAIVED'].map((s) => (
                        <option key={s} value={s}>{s.replace('_', ' ')}</option>
                      ))}
                    </select>
                    <span className="text-xs text-slate-400 font-bold whitespace-nowrap">
                      {rows.length} of {detail.assignments.length} records
                    </span>
                  </div>
                </div>

                {/* Data Table */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                        <tr>
                          <th className="px-5 py-3.5">Member</th>
                          <th className="px-4 py-3.5">Amount Due</th>
                          <th className="px-4 py-3.5">Amount Paid</th>
                          <th className="px-4 py-3.5">Balance</th>
                          <th className="px-4 py-3.5">Status</th>
                          {canManage && <th className="px-4 py-3.5 text-right">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                        {rows.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-center py-12 text-slate-400">
                              No assignments match your search filter.
                            </td>
                          </tr>
                        ) : (
                          rows.map((a) => (
                            <tr key={a.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                              <td className="px-5 py-3.5">
                                <div className="font-bold text-slate-900 dark:text-white">{a.member.name}</div>
                                <div className="text-[11px] text-slate-400">{a.member.memberCode}{a.member.subTeam ? ` · ${a.member.subTeam}` : ''}</div>
                              </td>
                              <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 font-semibold">{naira(a.amountDue)}</td>
                              <td className="px-4 py-3.5 text-emerald-600 font-semibold">{naira(a.amountPaid)}</td>
                              <td className={`px-4 py-3.5 font-bold ${a.balance > 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>
                                {naira(a.balance)}
                              </td>
                              <td className="px-4 py-3.5">
                                <Badge tone={STATUS_TONE[a.status] ?? 'neutral'}>
                                  {a.status.replace('_', ' ')}
                                </Badge>
                              </td>
                              {canManage && (
                                <td className="px-4 py-3.5 text-right">
                                  <button
                                    onClick={() => setEditAssignment(a)}
                                    className="px-2.5 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-colors"
                                  >
                                    Adjust
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {creating && (
        <NewPeriodModal
          onClose={() => setCreating(false)}
          onDone={(id) => {
            setCreating(false);
            notify('Dues period created', 'success');
            loadPeriods().then(() => setSelected(id));
          }}
        />
      )}

      {importing && (
        <ImportModal
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false);
            loadPeriods();
            if (selected) loadDetail(selected);
          }}
        />
      )}

      {editAssignment && (
        <AdjustModal
          assignment={editAssignment}
          onClose={() => setEditAssignment(null)}
          onDone={() => {
            setEditAssignment(null);
            notify('Updated', 'success');
            if (selected) loadDetail(selected);
          }}
        />
      )}
    </AdminLayoutShell>
  );
}

function NewPeriodModal({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const { notify } = useToast();
  const now = new Date();
  const [form, setForm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1, defaultAmount: 2000, dueDate: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    setSaving(true);
    try {
      const res = await fetchApi<{ period: { id: string } }>('/finance/dues/periods', {
        method: 'POST',
        body: JSON.stringify({
          year: Number(form.year),
          month: Number(form.month),
          defaultAmount: Number(form.defaultAmount),
          dueDate: form.dueDate || undefined,
        }),
      });
      onDone(res.period.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the period.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New dues period"
      description="Assignments are generated for every active member."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Create period</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Month">
            <select className={inputClass} value={form.month} onChange={(e) => setForm({ ...form, month: Number(e.target.value) })}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="Year">
            <input type="number" className={inputClass} value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Default monthly amount (₦)" hint="Per-member amounts can be adjusted individually">
          <input type="number" className={inputClass} value={form.defaultAmount} onChange={(e) => setForm({ ...form, defaultAmount: Number(e.target.value) })} />
        </Field>
        <Field label="Due date">
          <input type="date" className={inputClass} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        </Field>
        {err && <p role="alert" className="text-sm font-medium text-error">{err}</p>}
      </div>
    </Modal>
  );
}

function AdjustModal({ assignment, onClose, onDone }: { assignment: Assignment; onClose: () => void; onDone: () => void }) {
  const { notify } = useToast();
  const [tab, setTab] = useState<'status' | 'amount'>('status');
  const [status, setStatus] = useState('OUTSTANDING');
  const [amount, setAmount] = useState(assignment.amountDue);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      if (tab === 'status') {
        await fetchApi(`/finance/dues/assignments/${assignment.id}/status`, { method: 'POST', body: JSON.stringify({ status, reason }) });
      } else {
        await fetchApi(`/finance/dues/assignments/${assignment.id}/adjust`, { method: 'POST', body: JSON.stringify({ amountDue: Number(amount), reason }) });
      }
      onDone();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Adjust — ${assignment.member.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-1 rounded-lg bg-surface-container p-1">
          {(['status', 'amount'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold capitalize ${tab === t ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant'}`}>
              {t === 'status' ? 'Exempt / waive' : 'Adjust amount'}
            </button>
          ))}
        </div>
        {tab === 'status' ? (
          <Field label="Status">
            <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="OUTSTANDING">Outstanding (recompute from payments)</option>
              <option value="EXEMPT">Exempt (not expected to pay)</option>
              <option value="WAIVED">Waived (forgiven this month)</option>
            </select>
          </Field>
        ) : (
          <Field label="Amount due (₦)">
            <input type="number" className={inputClass} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
        )}
        <Field label="Reason" required={tab === 'amount'}>
          <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </Field>
      </div>
    </Modal>
  );
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { notify } = useToast();
  const [directoryText, setDirectoryText] = useState('');
  const [duesText, setDuesText] = useState('');
  const [report, setReport] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async (apply: boolean) => {
    setErr('');
    setBusy(true);
    try {
      let dirReport: any = null;
      if (directoryText.trim()) {
        const rows = JSON.parse(directoryText).members ?? JSON.parse(directoryText);
        dirReport = await fetchApi('/members/import', { method: 'POST', body: JSON.stringify({ rows, apply }) });
      }
      let duesReport: any = null;
      if (duesText.trim()) {
        const payload = JSON.parse(duesText);
        duesReport = await fetchApi('/finance/dues/import', {
          method: 'POST',
          body: JSON.stringify({ ...payload, apply, createUnmatchedMembers: apply }),
        });
      }
      setReport({ dir: dirReport, dues: duesReport, applied: apply });
      if (apply) {
        notify('Import applied', 'success');
        onDone();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Import failed — check the JSON.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Import from spreadsheet"
      description="Paste the directory and/or dues-matrix JSON (see apps/api/prisma/data/*.json for the shape)."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button variant="secondary" onClick={() => run(false)} loading={busy}>Dry run</Button>
          <Button onClick={() => run(true)} loading={busy}>Apply</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Member directory JSON (optional)" hint="{ members: [{ firstName, lastName, email, phoneNumber, birthday, profession }] }">
          <textarea className={`${inputClass} font-mono text-xs`} rows={5} value={directoryText} onChange={(e) => setDirectoryText(e.target.value)} />
        </Field>
        <Field label="Dues matrix JSON (optional)" hint='{ year, defaultAmount, rows: [{ name, amount, paidMonths: [1,2,...] }] }'>
          <textarea className={`${inputClass} font-mono text-xs`} rows={5} value={duesText} onChange={(e) => setDuesText(e.target.value)} />
        </Field>
        {err && <p role="alert" className="text-sm font-medium text-error">{err}</p>}
        {report && (
          <div className="space-y-2 rounded-lg bg-surface-container-low p-3 text-xs">
            <p className="font-semibold">{report.applied ? 'Applied' : 'Dry run'}</p>
            {report.dir && <p>Directory — created {report.dir.created.length}, updated {report.dir.updated.length}, errors {report.dir.errors.length}</p>}
            {report.dues && (
              <>
                <p>
                  Dues — matched {report.dues.matched.length}, new members {report.dues.createdMembers.length}, payments {report.dues.paymentsWritten}
                </p>
                {report.dues.unmatched?.length > 0 && <p className="text-error">Unmatched: {report.dues.unmatched.map((u: any) => u.name).join(', ')}</p>}
                {report.dues.ambiguous?.length > 0 && <p className="text-secondary">Ambiguous: {report.dues.ambiguous.map((a: any) => a.name).join(', ')}</p>}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
