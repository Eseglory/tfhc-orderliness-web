'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogoIcon } from '../../../../components/LogoIcon';
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
interface Campaign {
  id: string;
  periodId: string;
  title: string;
  description: string | null;
  deadline: string;
  periodStatus: string;
  showAsAlert: boolean;
  amountDue: number;
  amountPaid: number;
  balance: number;
  status: string;
  paymentAccount: Account | null;
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
  const router = useRouter();
  const [dues, setDues] = useState<Dues[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [declaring, setDeclaring] = useState<{ id: string; label: string; balance: number; purpose: 'MONTHLY_DUES' | 'SPECIAL_CONTRIBUTION' } | null>(null);
  const [message, setMessage] = useState('');

  const load = async () => {
    try {
      const [d, c, a, p] = await Promise.all([
        fetchApi<Dues[]>('/me/finance/dues'),
        fetchApi<Campaign[]>('/me/finance/campaigns'),
        fetchApi<Account[]>('/me/finance/payment-accounts'),
        fetchApi<Payment[]>('/me/finance/payments'),
      ]);
      setDues(d);
      setCampaigns(c);
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
  const owingCampaigns = campaigns.filter((c) => c.balance > 0 && !['EXEMPT', 'WAIVED'].includes(c.status));

  return (
    <div className="min-h-screen bg-background pb-28 text-on-background">
      {/* Top App Bar */}
      <header className="flex justify-between items-center w-full px-4 h-16 bg-background sticky top-0 z-40 border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center transition-all duration-200 active:scale-95 hover:opacity-80"
          >
            <span className="material-symbols-outlined text-on-surface-variant">arrow_back</span>
          </button>
          <h1 className="font-headline-sm text-base sm:text-lg font-bold text-primary">Monthly Dues</h1>
        </div>
        <div className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center overflow-hidden border border-outline-variant p-1">
          <LogoIcon alt="TFHC Logo" className="w-full h-full object-contain" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-primary">My Dues &amp; Finance</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">Your monthly dues, contribution pledges, and payment history.</p>
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
                        <button onClick={() => setDeclaring({ id: d.id, label: d.period, balance: d.balance, purpose: 'MONTHLY_DUES' })} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary">I’ve paid</button>
                      )}
                    </div>
                  </article>
                ))
              )}
            </section>

            {campaigns.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-bold text-on-surface">Special contributions</h2>
                {owingCampaigns.length > 0 && (
                  <p className="text-xs text-on-surface-variant">
                    You owe {naira(owingCampaigns.reduce((s, c) => s + c.balance, 0))} across {owingCampaigns.length} contribution{owingCampaigns.length > 1 ? 's' : ''}.
                  </p>
                )}
                {campaigns.map((c) => (
                  <article key={c.id} className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 shadow-sm space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-on-surface">{c.title}</p>
                        {c.description && <p className="mt-0.5 text-xs text-on-surface-variant">{c.description}</p>}
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {naira(c.amountPaid)} / {naira(c.amountDue)}
                          {c.balance > 0 ? ` · ${naira(c.balance)} left` : ''}
                          {' · Deadline '}{new Date(c.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge(c.status)}`}>{c.status.replace('_', ' ')}</span>
                    </div>
                    {c.paymentAccount && (
                      <div className="rounded-lg bg-surface-container-low p-2.5 text-xs">
                        <p className="font-semibold text-on-surface">{c.paymentAccount.bankName}</p>
                        <p>{c.paymentAccount.accountName}</p>
                        <p className="font-mono">{c.paymentAccount.accountNumber}</p>
                        {c.paymentAccount.instructions && <p className="mt-1 text-on-surface-variant">{c.paymentAccount.instructions}</p>}
                      </div>
                    )}
                    {c.balance > 0 && !['EXEMPT', 'WAIVED'].includes(c.status) && (
                      <div className="flex justify-end">
                        <button onClick={() => setDeclaring({ id: c.id, label: c.title, balance: c.balance, purpose: 'SPECIAL_CONTRIBUTION' })} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary">I’ve paid</button>
                      </div>
                    )}
                  </article>
                ))}
              </section>
            )}

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

      {declaring && (
        <DeclareModal
          target={declaring}
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

function DeclareModal({
  target,
  onClose,
  onDone,
}: {
  target: { id: string; label: string; balance: number; purpose: 'MONTHLY_DUES' | 'SPECIAL_CONTRIBUTION' };
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(target.balance);
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [payerReference, setPayerReference] = useState('');
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptName, setReceiptName] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErr('Receipt file size must be less than 5 MB.');
      return;
    }

    setReceiptName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setReceiptUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    setErr('');
    if (!(Number(amount) > 0)) return setErr('Enter the amount you paid.');
    setSaving(true);
    try {
      await fetchApi('/me/finance/payments', {
        method: 'POST',
        body: JSON.stringify({
          purpose: target.purpose,
          amount: Number(amount),
          method,
          payerReference: payerReference.trim() || undefined,
          paidOn,
          duesAssignmentId: target.id,
          receiptUrl: receiptUrl || undefined,
          receiptName: receiptName || undefined,
        }),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not submit payment declaration.');
    } finally {
      setSaving(false);
    }
  };

  const field =
    'w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3.5 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors';

  const dueTypeLabel = target.purpose === 'MONTHLY_DUES' ? 'Monthly Dues' : 'Special Contribution';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-in fade-in duration-150"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {dueTypeLabel}
              </span>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {target.label}
              </span>
            </div>
            <h3 className="text-lg font-black text-[#0b1c30] dark:text-white mt-1">
              Submit Payment Receipt
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Declare your transfer details and attach your bank payment receipt. Once verified by the finance administrator, your dues will be credited.
        </p>

        <div className="mt-4 space-y-3.5">
          <label className="block space-y-1">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Amount Paid (₦)</span>
            <input
              type="number"
              className={field}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Payment Method</span>
            <select className={field} value={method} onChange={(e) => setMethod(e.target.value)}>
              {['BANK_TRANSFER', 'POS', 'CASH', 'ONLINE', 'OTHER'].map((m) => (
                <option key={m} value={m}>
                  {m.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Transfer Narration / Transaction Reference
            </span>
            <input
              className={field}
              placeholder="e.g. Stanbic / TRF / Ese Glory Sept Dues"
              value={payerReference}
              onChange={(e) => setPayerReference(e.target.value)}
              maxLength={200}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Payment Date</span>
            <input
              type="date"
              className={field}
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
            />
          </label>

          {/* Receipt Attachment Input */}
          <div className="space-y-1.5 pt-1">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-primary">receipt_long</span>
              <span>Attach Proof of Payment / Receipt</span>
            </span>

            {receiptUrl ? (
              <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                <div className="flex items-center gap-2.5 min-w-0">
                  {receiptUrl.startsWith('data:image') ? (
                    <img
                      src={receiptUrl}
                      alt="Receipt preview"
                      className="w-12 h-12 rounded-lg object-cover border border-emerald-300 dark:border-emerald-700 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-emerald-200 dark:bg-emerald-900 flex items-center justify-center text-emerald-800 dark:text-emerald-200 shrink-0">
                      <span className="material-symbols-outlined text-xl">description</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200 truncate">
                      {receiptName || 'Receipt Attached'}
                    </p>
                    <p className="text-[10px] text-emerald-700 dark:text-emerald-400">Ready to submit</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setReceiptUrl(null);
                    setReceiptName('');
                  }}
                  className="p-1 text-emerald-700 hover:text-red-600 rounded-lg transition-colors shrink-0"
                >
                  <span className="material-symbols-outlined text-lg">delete</span>
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-2xl border-2 border-dashed border-outline-variant/50 hover:border-primary bg-surface-container-low hover:bg-surface-container cursor-pointer transition-colors text-center">
                <span className="material-symbols-outlined text-2xl text-primary">upload_file</span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Click to upload transfer screenshot or receipt
                </span>
                <span className="text-[10px] text-slate-500">Supports PNG, JPG, WebP, PDF (up to 5 MB)</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            )}
          </div>

          {err && <p role="alert" className="text-xs font-bold text-red-600 dark:text-red-400">{err}</p>}

          <div className="flex justify-end gap-2.5 pt-3">
            <button
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="rounded-xl bg-[#f2320c] hover:bg-[#d82a08] text-white px-5 py-2.5 text-xs font-extrabold shadow-sm transition-transform active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                  <span>Submitting…</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">send</span>
                  <span>Submit Payment</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
