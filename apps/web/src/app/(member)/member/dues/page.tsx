'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '../../../../components/Navbar';
import { BottomNav } from '../../../../components/BottomNav';
import { fetchApi } from '../../../../lib/api';

const naira = (n: number) => `₦${Math.round(n).toLocaleString()}`;

interface Dues {
  id: string;
  period: string;
  periodId: string;
  amountDue: number;
  amountPaid: number;
  balance: number;
  dueDate: string;
  status: string;
}
interface Account {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  instructions: string | null;
}
interface Payment {
  id: string;
  reference: string;
  amount: number;
  purpose: string;
  status: string;
  paidOn: string;
  duesPeriod: string | null;
}

const badge = (s: string) =>
  s === 'PAID'
    ? 'bg-tertiary-container text-on-tertiary-container'
    : s === 'OVERDUE'
      ? 'bg-error-container text-on-error-container'
      : s === 'PARTIALLY_PAID'
        ? 'bg-secondary-container/40 text-on-secondary-container'
        : s === 'EXEMPT' || s === 'WAIVED'
          ? 'bg-surface-container-high text-on-surface-variant'
          : 'bg-primary-fixed text-on-primary-fixed';

export default function MemberDuesPage() {
  const [dues, setDues] = useState<Dues[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [declaring, setDeclaring] = useState<Dues | null>(null);
  const [message, setMessage] = useState('');

  const load = async () => {
    try {
      const [d, a, p] = await Promise.all([
        fetchApi<Dues[]>('/me/finance/dues'),
        fetchApi<Account[]>('/me/finance/payment-accounts'),
        fetchApi<Payment[]>('/me/finance/payments'),
      ]);
      setDues(d);
      setAccounts(a);
      setPayments(p);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your dues.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const owing = dues.filter((d) => d.balance > 0 && !['EXEMPT', 'WAIVED'].includes(d.status));
  const totalOwed = owing.reduce((s, d) => s + d.balance, 0);

  return (
    <div className="min-h-screen bg-background pb-24">
      <Navbar />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <nav className="text-xs text-on-surface-variant">
          <Link href="/member" className="hover:text-primary">Home</Link>
          <span className="mx-1.5">/</span>
          <span className="text-on-surface">My Dues</span>
        </nav>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">Monthly Dues</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Your dues, payment history and how to pay.</p>
        </div>

        {loading ? (
          <p className="text-sm text-on-surface-variant">Loading…</p>
        ) : error ? (
          <p role="alert" className="text-sm text-error">{error}</p>
        ) : (
          <>
            {totalOwed > 0 && (
              <div className="rounded-2xl border border-error/30 bg-error-container/40 p-4">
                <p className="text-sm font-semibold text-on-error-container">You owe {naira(totalOwed)} across {owing.length} month{owing.length > 1 ? 's' : ''}.</p>
              </div>
            )}

            {accounts.length > 0 && (
              <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm">
                <h2 className="text-sm font-bold text-on-surface">Pay into</h2>
                {accounts.map((a) => (
                  <div key={a.id} className="mt-2 rounded-xl bg-surface-container-low p-3 text-sm">
                    <p className="font-semibold text-on-surface">{a.bankName}</p>
                    <p>{a.accountName}</p>
                    <p className="font-mono">{a.accountNumber}</p>
                    {a.instructions && <p className="mt-1 text-xs text-on-surface-variant">{a.instructions}</p>}
                  </div>
                ))}
                <p className="mt-2 text-xs text-on-surface-variant">After paying, tap “I’ve paid” on a month below so the finance team can confirm it.</p>
              </section>
            )}

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-on-surface">By month</h2>
              {dues.length === 0 ? (
                <p className="rounded-xl border border-dashed border-outline-variant/40 p-6 text-center text-sm text-on-surface-variant">No dues assigned yet.</p>
              ) : (
                dues.map((d) => (
                  <article key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 shadow-sm">
                    <div>
                      <p className="font-semibold text-on-surface">{d.period}</p>
                      <p className="text-xs text-on-surface-variant">
                        {naira(d.amountPaid)} / {naira(d.amountDue)}
                        {d.balance > 0 ? ` · ${naira(d.balance)} left` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge(d.status)}`}>{d.status.replace('_', ' ')}</span>
                      {d.balance > 0 && !['EXEMPT', 'WAIVED'].includes(d.status) && (
                        <button onClick={() => setDeclaring(d)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary">I’ve paid</button>
                      )}
                    </div>
                  </article>
                ))
              )}
            </section>

            {payments.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-bold text-on-surface">Payment history</h2>
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-xl border border-outline-variant/25 bg-surface-container-lowest p-3 text-sm shadow-sm">
                    <div>
                      <p className="font-medium text-on-surface">{naira(p.amount)} · {p.purpose.replace('_', ' ').toLowerCase()}</p>
                      <p className="text-xs text-on-surface-variant"><span className="font-mono">{p.reference}</span> · {new Date(p.paidOn).toLocaleDateString()}{p.duesPeriod ? ` · ${p.duesPeriod}` : ''}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge(p.status === 'CONFIRMED' ? 'PAID' : p.status === 'REJECTED' ? 'OVERDUE' : 'OUTSTANDING')}`}>{p.status}</span>
                  </div>
                ))}
              </section>
            )}
            {message && <p role="status" className="text-sm font-medium text-tertiary">{message}</p>}
          </>
        )}
      </main>
      <BottomNav />

      {declaring && (
        <DeclareModal
          dues={declaring}
          onClose={() => setDeclaring(null)}
          onDone={() => {
            setDeclaring(null);
            setMessage('Payment submitted — the finance team will confirm it.');
            load();
          }}
        />
      )}
    </div>
  );
}

function DeclareModal({ dues, onClose, onDone }: { dues: Dues; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(dues.balance);
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [payerReference, setPayerReference] = useState('');
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    if (!(Number(amount) > 0)) return setErr('Enter the amount you paid.');
    setSaving(true);
    try {
      await fetchApi('/me/finance/payments', {
        method: 'POST',
        body: JSON.stringify({
          purpose: 'MONTHLY_DUES',
          amount: Number(amount),
          method,
          payerReference: payerReference.trim() || undefined,
          paidOn,
          duesAssignmentId: dues.id,
        }),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not submit.');
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-inverse-surface/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-t-2xl bg-surface-container-lowest p-5 shadow-xl sm:rounded-2xl">
        <h3 className="text-lg font-bold text-on-surface">Record a payment — {dues.period}</h3>
        <p className="mt-0.5 text-sm text-on-surface-variant">The finance team confirms it against the bank statement.</p>
        <div className="mt-4 space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-on-surface">Amount (₦)</span>
            <input type="number" className={field} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-on-surface">Method</span>
            <select className={field} value={method} onChange={(e) => setMethod(e.target.value)}>
              {['BANK_TRANSFER', 'CASH', 'POS', 'ONLINE', 'OTHER'].map((m) => (<option key={m} value={m}>{m.replace('_', ' ')}</option>))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-on-surface">Transfer reference (optional)</span>
            <input className={field} value={payerReference} onChange={(e) => setPayerReference(e.target.value)} maxLength={200} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-on-surface">Date paid</span>
            <input type="date" className={field} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </label>
          {err && <p role="alert" className="text-sm font-medium text-error">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant">Cancel</button>
            <button onClick={submit} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50">
              {saving ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
