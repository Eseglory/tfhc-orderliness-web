'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '../../../../../components/Navbar';
import { Badge, Button, EmptyState, Field, Modal, PageHeader, Spinner, inputClass, useToast } from '../../../../../components/ui';
import { fetchApi, ApiError } from '../../../../../lib/api';
import { useAuth } from '../../../../../lib/auth';

const naira = (n: number) => `₦${Math.round(n).toLocaleString()}`;

interface Payment {
  id: string;
  reference: string;
  member: string;
  memberCode: string;
  purpose: string;
  amount: number;
  method: string;
  payerReference: string | null;
  description: string | null;
  paidOn: string;
  status: string;
  rejectionReason: string | null;
  duesPeriod: string | null;
  createdAt: string;
}

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  CONFIRMED: 'success',
  PENDING: 'warning',
  REJECTED: 'danger',
  REFUNDED: 'neutral',
};

export default function PaymentsPage() {
  const { can, loading: authLoading } = useAuth();
  const { notify } = useToast();
  const [rows, setRows] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('PENDING');
  const [busy, setBusy] = useState('');
  const [rejecting, setRejecting] = useState<Payment | null>(null);
  const manage = can('payments.manage');

  const load = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (status) q.set('status', status);
      setRows(await fetchApi<Payment[]>(`/finance/payments?${q}`));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? 'You do not have access to payments.' : 'Could not load payments.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!authLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, status]);

  const confirm = async (p: Payment) => {
    setBusy(p.id);
    try {
      await fetchApi(`/finance/payments/${p.id}/confirm`, { method: 'POST', body: '{}' });
      notify('Payment confirmed', 'success');
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not confirm', 'error');
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
          <span className="text-on-surface">Payments</span>
        </nav>
        <PageHeader title="Payments" subtitle="Member-declared and recorded payments awaiting confirmation." />

        <div className="flex gap-1 rounded-xl bg-surface-container p-1">
          {['PENDING', 'CONFIRMED', 'REJECTED', ''].map((s) => (
            <button
              key={s || 'all'}
              onClick={() => setStatus(s)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold capitalize ${status === s ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant'}`}
            >
              {s ? s.toLowerCase() : 'All'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16 text-on-surface-variant"><Spinner /></div>
        ) : error ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={load}>Retry</Button>} />
        ) : rows.length === 0 ? (
          <EmptyState title="No payments" description={status === 'PENDING' ? 'Nothing awaiting confirmation.' : undefined} />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="border-b border-outline-variant/20 bg-surface-container-low/60 text-left text-xs uppercase tracking-wide text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3 font-semibold">Member</th>
                  <th className="px-4 py-3 font-semibold">Purpose</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Reference</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  {manage && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15">
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-on-surface">{p.member}</div>
                      <div className="text-xs text-on-surface-variant">{p.memberCode} · {new Date(p.paidOn).toLocaleDateString()}</div>
                    </td>
                    <td className="px-4 py-2.5 text-on-surface-variant">
                      {p.purpose.replace('_', ' ').toLowerCase()}
                      {p.duesPeriod && <span className="block text-xs">{p.duesPeriod}</span>}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-on-surface">{naira(p.amount)}</td>
                    <td className="px-4 py-2.5 text-xs text-on-surface-variant">
                      <span className="font-mono">{p.reference}</span>
                      {p.payerReference && <span className="block">payer: {p.payerReference}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={TONE[p.status] ?? 'neutral'}>{p.status}</Badge>
                      {p.rejectionReason && <span className="block text-xs text-error">{p.rejectionReason}</span>}
                    </td>
                    {manage && (
                      <td className="px-4 py-2.5 text-right">
                        {p.status === 'PENDING' && (
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" className="text-xs text-error" onClick={() => setRejecting(p)}>Reject</Button>
                            <Button variant="ghost" className="text-xs text-tertiary" loading={busy === p.id} onClick={() => confirm(p)}>Confirm</Button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {rejecting && (
        <RejectModal
          payment={rejecting}
          onClose={() => setRejecting(null)}
          onDone={() => {
            setRejecting(null);
            notify('Payment rejected', 'success');
            load();
          }}
        />
      )}
    </div>
  );
}

function RejectModal({ payment, onClose, onDone }: { payment: Payment; onClose: () => void; onDone: () => void }) {
  const { notify } = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Reject ${payment.reference}?`}
      description={`${payment.member} — ₦${payment.amount.toLocaleString()}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            loading={saving}
            onClick={async () => {
              if (!reason.trim()) return;
              setSaving(true);
              try {
                await fetchApi(`/finance/payments/${payment.id}/reject`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
                onDone();
              } catch (e) {
                notify(e instanceof Error ? e.message : 'Could not reject', 'error');
              } finally {
                setSaving(false);
              }
            }}
          >
            Reject payment
          </Button>
        </>
      }
    >
      <Field label="Reason" required>
        <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </Field>
    </Modal>
  );
}
