'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '../../../../../components/Navbar';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  PageHeader,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <nav className="text-xs text-on-surface-variant">
          <Link href="/admin/finance" className="hover:text-primary">Finance</Link>
          <span className="mx-1.5">/</span>
          <span className="text-on-surface">Monthly Dues</span>
        </nav>
        <PageHeader
          title="Monthly Dues"
          subtitle="Per-member dues, payments and arrears by month."
          actions={
            canManage ? (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setImporting(true)}>Import from spreadsheet</Button>
                {can('dues.create') && <Button onClick={() => setCreating(true)}>+ New period</Button>}
              </div>
            ) : undefined
          }
        />

        {loading ? (
          <div className="flex justify-center py-16 text-on-surface-variant"><Spinner /></div>
        ) : error ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={loadPeriods}>Retry</Button>} />
        ) : periods.length === 0 ? (
          <EmptyState
            title="No dues periods yet"
            description="Create a period (or import the spreadsheet) to start."
            action={can('dues.create') ? <Button onClick={() => setCreating(true)}>+ New period</Button> : undefined}
          />
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {periods.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  className={`whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-semibold ${
                    selected === p.id ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant/30 bg-surface-container-lowest text-on-surface-variant'
                  }`}
                >
                  {p.label}
                  <span className="ml-1.5 text-xs opacity-70">{p.assignmentCount}</span>
                </button>
              ))}
            </div>

            {detailLoading || !detail ? (
              <div className="flex justify-center py-16 text-on-surface-variant"><Spinner /></div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {[
                    ['Expected', naira(detail.summary.expected), 'text-on-surface'],
                    ['Collected', naira(detail.summary.collected), 'text-tertiary'],
                    ['Outstanding', naira(detail.summary.outstanding), detail.summary.outstanding ? 'text-error' : 'text-on-surface'],
                    ['Collection rate', `${detail.summary.collectionRate}%`, 'text-on-surface'],
                    ['Overdue members', String(detail.summary.overdue), detail.summary.overdue ? 'text-error' : 'text-on-surface'],
                  ].map(([label, value, tone]) => (
                    <div key={label} className="rounded-xl border border-outline-variant/25 bg-surface-container-lowest p-3 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{label}</p>
                      <p className={`mt-0.5 text-lg font-bold ${tone}`}>{value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input className={`${inputClass} max-w-xs`} placeholder="Search member…" value={search} onChange={(e) => setSearch(e.target.value)} />
                  <select className={`${inputClass} w-auto`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="">All statuses</option>
                    {['PAID', 'PARTIALLY_PAID', 'OUTSTANDING', 'OVERDUE', 'EXEMPT', 'WAIVED'].map((s) => (
                      <option key={s} value={s}>{s.replace('_', ' ')}</option>
                    ))}
                  </select>
                  <span className="text-xs text-on-surface-variant">{rows.length} of {detail.assignments.length}</span>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm">
                  <table className="w-full min-w-[40rem] text-sm">
                    <thead className="border-b border-outline-variant/20 bg-surface-container-low/60 text-left text-xs uppercase tracking-wide text-on-surface-variant">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Member</th>
                        <th className="px-4 py-3 font-semibold">Due</th>
                        <th className="px-4 py-3 font-semibold">Paid</th>
                        <th className="px-4 py-3 font-semibold">Balance</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        {canManage && <th className="px-4 py-3" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/15">
                      {rows.map((a) => (
                        <tr key={a.id}>
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-on-surface">{a.member.name}</div>
                            <div className="text-xs text-on-surface-variant">{a.member.memberCode}{a.member.subTeam ? ` · ${a.member.subTeam}` : ''}</div>
                          </td>
                          <td className="px-4 py-2.5 text-on-surface-variant">{naira(a.amountDue)}</td>
                          <td className="px-4 py-2.5 text-on-surface-variant">{naira(a.amountPaid)}</td>
                          <td className={`px-4 py-2.5 font-medium ${a.balance ? 'text-error' : 'text-tertiary'}`}>{naira(a.balance)}</td>
                          <td className="px-4 py-2.5"><Badge tone={STATUS_TONE[a.status] ?? 'neutral'}>{a.status.replace('_', ' ')}</Badge></td>
                          {canManage && (
                            <td className="px-4 py-2.5 text-right">
                              <Button variant="ghost" className="text-xs" onClick={() => setEditAssignment(a)}>Adjust</Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </main>

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
    </div>
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
