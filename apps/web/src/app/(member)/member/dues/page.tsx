'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Upload,
  Receipt,
  Copy,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  Download,
  DollarSign,
  Info,
  Archive,
} from 'lucide-react';
import { LogoIcon } from '../../../../components/LogoIcon';
import { fetchApi } from '../../../../lib/api';
import { PageLoader, CardSkeleton, useToast } from '../../../../components/ui';
import { MemberFinanceNav } from '../../../../components/member/MemberFinanceNav';
import { optimizeReceiptFile, formatFileSize } from '../../../../lib/image-optimizer';

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;

interface Account {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  instructions: string | null;
}

interface Dues {
  id: string;
  period: string;
  periodId: string;
  amountDue: number;
  amountPaid: number;
  balance: number;
  dueDate: string;
  status: string;
  category?: 'Executive' | 'Regular';
  monthlyRate?: number;
  hasPendingPayment?: boolean;
  receiptUrl?: string | null;
  receiptName?: string | null;
  paymentAccount?: Account | null;
}

interface Payment {
  id: string;
  reference: string;
  amount: number;
  purpose: string;
  status: string;
  paidOn: string;
  duesPeriod: string | null;
  receiptUrl?: string | null;
  receiptName?: string | null;
  isReceiptArchived?: boolean;
  receiptArchivedReason?: string | null;
  receiptRetentionUntil?: string | null;
  receiptOriginalSize?: number | null;
  receiptOptimizedSize?: number | null;
  receiptCompressionRatio?: number | null;
  description?: string | null;
  payerReference?: string | null;
  rejectionReason?: string | null;
}

interface Campaign {
  id: string;
  title: string;
  balance: number;
  status: string;
}

export default function MemberDuesPage() {
  const router = useRouter();
  const { notify } = useToast();
  const [dues, setDues] = useState<Dues[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [declaring, setDeclaring] = useState<{ id: string; label: string; balance: number; purpose: 'MONTHLY_DUES' } | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<Payment | null>(null);
  const [copiedAccount, setCopiedAccount] = useState<string | null>(null);

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
      setError(e instanceof Error ? e.message : 'Could not load your monthly dues.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const copyNumber = (num: string) => {
    navigator.clipboard.writeText(num);
    setCopiedAccount(num);
    notify('Account number copied to clipboard', 'success');
    setTimeout(() => setCopiedAccount(null), 3000);
  };

  // Determine membership category & rate
  const userCategory = dues[0]?.category || 'Regular';
  const userRate = dues[0]?.monthlyRate || (userCategory === 'Executive' ? 2500 : 2000);

  // Filter dues
  const owingDues = dues.filter((d) => d.balance > 0 && !['EXEMPT', 'WAIVED'].includes(d.status));
  const paidDues = dues.filter((d) => d.status === 'PAID');
  const waivedDues = dues.filter((d) => d.status === 'WAIVED' || d.status === 'EXEMPT');
  const pendingDues = dues.filter((d) => d.hasPendingPayment);

  const totalExpected = dues
    .filter((d) => !['EXEMPT', 'WAIVED'].includes(d.status))
    .reduce((sum, d) => sum + d.amountDue, 0);
  const totalPaid = dues.reduce((sum, d) => sum + d.amountPaid, 0);
  const totalOutstanding = Math.max(0, totalExpected - totalPaid);
  const totalWaived = waivedDues.length * userRate;
  const completionRate = totalExpected > 0 ? Math.min(100, Math.round((totalPaid / totalExpected) * 100)) : 100;

  // Designated monthly dues account
  const designatedAccount = dues[0]?.paymentAccount || accounts[0] || null;

  // Active special campaigns count for sub-nav badge
  const activeCampaignsCount = campaigns.filter((c) => c.balance > 0 && !['EXEMPT', 'WAIVED'].includes(c.status)).length;
  const pendingPaymentsCount = payments.filter((p) => p.status === 'PENDING').length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-28 text-slate-800 dark:text-slate-200">
      {/* Top Header */}
      <header className="flex justify-between items-center w-full px-4 h-16 bg-white dark:bg-slate-900 sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center transition-all duration-200 active:scale-95 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </button>
          <div>
            <h1 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white leading-tight">
              Monthly Dues
            </h1>
            <p className="text-[10px] text-slate-400 font-medium">Regular Financial Obligation</p>
          </div>
        </div>
        <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700 p-1">
          <LogoIcon alt="TFHC Logo" className="w-full h-full object-contain" />
        </div>
      </header>

      {/* Sub-Navigation Bar */}
      <MemberFinanceNav
        active="dues"
        unpaidDuesCount={owingDues.length}
        activeCampaignsCount={activeCampaignsCount}
        pendingPaymentsCount={pendingPaymentsCount}
      />

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-5">
        {/* Membership Category & Rate Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-50/90 via-indigo-50/60 to-white dark:from-purple-950/40 dark:via-indigo-950/30 dark:to-slate-900 border border-purple-200/80 dark:border-purple-800/60 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                  userCategory === 'Executive'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-indigo-600 text-white shadow-xs'
                }`}
              >
                {userCategory} Member
              </span>
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                {naira(userRate)} / month
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              This is your regular monthly financial obligation towards unit stewardship.
              {userCategory === 'Executive'
                ? ' Executive rate: ₦2,500/month.'
                : ' Regular member rate: ₦2,000/month.'}
            </p>
          </div>

          <div className="text-right sm:text-right shrink-0">
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Outstanding Balance</span>
            <span
              className={`text-xl font-black ${
                totalOutstanding > 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              {naira(totalOutstanding)}
            </span>
            <span className="text-[10px] text-slate-400 block">
              {owingDues.length === 0 ? 'All assessed dues settled' : `${owingDues.length} month(s) pending`}
            </span>
          </div>
        </div>

        {/* Dedicated Bank Account for Monthly Dues */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <span>Designated Monthly Dues Account</span>
            </span>
            {designatedAccount && (
              <button
                onClick={() => copyNumber(designatedAccount.accountNumber)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedAccount === designatedAccount.accountNumber ? 'Copied!' : 'Copy Account'}</span>
              </button>
            )}
          </div>

          {designatedAccount ? (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                <span className="font-bold text-slate-900 dark:text-white">{designatedAccount.bankName}</span>
                <span>&bull;</span>
                <span className="text-slate-600 dark:text-slate-300">{designatedAccount.accountName}</span>
                <span>&bull;</span>
                <span className="font-mono font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                  {designatedAccount.accountNumber}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 pt-0.5">
                {designatedAccount.instructions || 'Narration remark: [Your Full Name or Member Code] - Monthly Dues.'}
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" />
              <span>No receiving bank account configured yet by treasury. Please contact unit finance.</span>
            </div>
          )}
        </div>

        {/* Financial Summary KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 text-center">
          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <span className="text-[10px] font-black uppercase text-slate-400 block">Total Expected</span>
            <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
              {naira(totalExpected)}
            </span>
            <span className="text-[9px] text-slate-400 block mt-0.5">{dues.length - waivedDues.length} active months</span>
          </div>

          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <span className="text-[10px] font-black uppercase text-slate-400 block">Total Paid</span>
            <span className="text-sm sm:text-base font-black text-emerald-600">
              {naira(totalPaid)}
            </span>
            <span className="text-[9px] text-slate-400 block mt-0.5">{paidDues.length} months settled</span>
          </div>

          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <span className="text-[10px] font-black uppercase text-slate-400 block">Outstanding</span>
            <span className={`text-sm sm:text-base font-black ${totalOutstanding > 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>
              {naira(totalOutstanding)}
            </span>
            <span className="text-[9px] text-slate-400 block mt-0.5">{owingDues.length} months unpaid</span>
          </div>

          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <span className="text-[10px] font-black uppercase text-slate-400 block">Waived Months</span>
            <span className="text-sm sm:text-base font-black text-amber-600">
              {waivedDues.length}
            </span>
            <span className="text-[9px] text-slate-400 block mt-0.5">{naira(totalWaived)} excluded</span>
          </div>
        </div>

        {/* Completion Progress Bar */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-slate-600 dark:text-slate-300">Annual Dues Settlement Progress</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-black">{completionRate}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                completionRate === 100
                  ? 'bg-emerald-500'
                  : completionRate > 50
                  ? 'bg-indigo-600'
                  : 'bg-amber-500'
              }`}
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        {/* 12-Month Detailed Ledger */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
              Monthly Dues Schedule
            </h2>
            <span className="text-[11px] text-slate-400">12 Months Assessed</span>
          </div>

          {loading ? (
            <div className="space-y-3">
              <CardSkeleton count={3} gridCols="grid-cols-1" />
            </div>
          ) : dues.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 text-slate-400 text-xs">
              No monthly dues periods assigned yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {dues.map((d) => {
                const isPaid = d.status === 'PAID';
                const isWaived = d.status === 'WAIVED' || d.status === 'EXEMPT';
                const isPending = d.hasPendingPayment;

                return (
                  <article
                    key={d.id}
                    className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                          {d.period}
                        </span>
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            <CheckCircle2 className="w-3 h-3" /> Paid
                          </span>
                        ) : isWaived ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-300">
                            <ShieldCheck className="w-3 h-3" /> Waived by Unit
                          </span>
                        ) : isPending ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-300">
                            <Clock className="w-3 h-3" /> Verification Pending
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            <AlertTriangle className="w-3 h-3" /> Unpaid
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-500">
                        {isWaived ? (
                          <span>This month was waived for your profile and is excluded from dues.</span>
                        ) : (
                          <span>
                            Rate: <strong>{naira(d.amountDue)}</strong> &bull; Paid:{' '}
                            <strong className="text-emerald-600">{naira(d.amountPaid)}</strong>
                            {d.balance > 0 && (
                              <span className="text-rose-600 font-bold"> &bull; {naira(d.balance)} balance</span>
                            )}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      {d.receiptUrl && (
                        <button
                          onClick={() => {
                            const p = payments.find((x) => x.duesPeriod === d.period) || {
                              id: d.id,
                              reference: 'PMT-RECEIPT',
                              amount: d.amountPaid,
                              purpose: 'MONTHLY_DUES',
                              status: d.status,
                              paidOn: new Date().toISOString(),
                              duesPeriod: d.period,
                              receiptUrl: d.receiptUrl,
                              receiptName: d.receiptName,
                            };
                            setViewingReceipt(p);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300 transition-colors"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Receipt</span>
                        </button>
                      )}

                      {d.balance > 0 && !isWaived && (
                        <button
                          onClick={() =>
                            setDeclaring({
                              id: d.id,
                              label: d.period,
                              balance: d.balance,
                              purpose: 'MONTHLY_DUES',
                            })
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-xs transition-transform active:scale-95 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>I&apos;ve Paid</span>
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {/* Banner to Other Contributions */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-300">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-xs text-slate-900 dark:text-white">
                Looking for Special Contributions?
              </h3>
              <p className="text-[11px] text-slate-400">
                Christmas Party (₦20,000), special projects, and dedicated drives are located separately.
              </p>
            </div>
          </div>
          <Link
            href="/member/contributions"
            className="inline-flex items-center gap-1 text-xs font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
          >
            <span>View Special Drives &rarr;</span>
          </Link>
        </div>
      </main>

      {/* Payment Declaration Modal */}
      {declaring && (
        <DeclareModal
          target={declaring}
          onClose={() => setDeclaring(null)}
          onDone={() => {
            setDeclaring(null);
            notify('Payment submitted for confirmation!', 'success');
            load();
          }}
        />
      )}

      {/* Receipt Viewer Modal */}
      {viewingReceipt && (
        <MemberReceiptModal
          payment={viewingReceipt}
          onClose={() => setViewingReceipt(null)}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// DECLARE MONTHLY DUES MODAL
// ----------------------------------------------------------------------------
function DeclareModal({
  target,
  onClose,
  onDone,
}: {
  target: { id: string; label: string; balance: number; purpose: 'MONTHLY_DUES' };
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState<number>(target.balance);
  const [method, setMethod] = useState<'BANK_TRANSFER' | 'CASH' | 'POS' | 'ONLINE'>('BANK_TRANSFER');
  const [payerReference, setPayerReference] = useState('');
  const [description, setDescription] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptDataUrl, setReceiptDataUrl] = useState<string | null>(null);
  const [receiptSizeLabel, setReceiptSizeLabel] = useState<string>('');
  const [optimizing, setOptimizing] = useState(false);
  const [optimizationSummary, setOptimizationSummary] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setOptimizing(true);
    setOptimizationSummary('');

    try {
      const res = await optimizeReceiptFile(file);
      setReceiptFile(file);
      setReceiptDataUrl(res.dataUrl);
      setOptimizationSummary(res.summary);
      setReceiptSizeLabel(formatFileSize(res.optimizedSize));
    } catch (err: any) {
      setError(err.message || 'Could not process receipt file');
      setReceiptFile(null);
      setReceiptDataUrl(null);
      setOptimizationSummary('');
      setReceiptSizeLabel('');
    } finally {
      setOptimizing(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptDataUrl) {
      setError('Please attach your payment receipt or transfer screenshot.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await fetchApi('/me/finance/payments', {
        method: 'POST',
        body: JSON.stringify({
          purpose: target.purpose,
          method,
          amount: Number(amount),
          duesAssignmentId: target.id,
          payerReference: payerReference.trim() || undefined,
          description: description.trim() || undefined,
          receiptUrl: receiptDataUrl,
          receiptName: receiptFile?.name || 'Receipt',
        }),
      });
      onDone();
    } catch (err: any) {
      setError(err.message || 'Could not submit payment declaration');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
              Confirm Monthly Dues Payment
            </h3>
            <p className="text-xs text-slate-500">{target.label}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-bold p-1"
          >
            &times;
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 text-xs">
          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Amount Paid (₦)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              min={100}
              required
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Payment Method
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
            >
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CASH">Cash</option>
              <option value="POS">POS Terminal</option>
              <option value="ONLINE">Online Portal</option>
            </select>
          </div>

          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Payment Receipt / Transfer Proof (Max 10MB) *
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
              onChange={handleFileChange}
              disabled={optimizing || busy}
              required
              className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 disabled:opacity-50"
            />
            {optimizing && (
              <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-1.5 flex items-center gap-1.5 font-bold">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
                Optimizing receipt for fast upload…
              </p>
            )}
            {optimizationSummary && !optimizing && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {optimizationSummary}
              </p>
            )}
            <p className="text-[10px] text-slate-400 mt-1">
              Supports photos/screenshots (JPG, PNG, WebP) and PDF documents up to 10MB. Images are automatically compressed to conserve storage and speed up uploads.
            </p>
          </div>

          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Sender Name / Narration / Reference (Optional)
            </label>
            <input
              type="text"
              value={payerReference}
              onChange={(e) => setPayerReference(e.target.value)}
              placeholder="e.g. John Doe - GTBank transfer"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Payment Note / Description (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Paid for January monthly dues via mobile bank transfer"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>

          {error && <p className="text-xs font-bold text-rose-600">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs disabled:opacity-50"
            >
              {busy ? 'Submitting…' : 'Submit for Verification'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// MEMBER RECEIPT MODAL
// ----------------------------------------------------------------------------
function MemberReceiptModal({
  payment,
  onClose,
}: {
  payment: Payment;
  onClose: () => void;
}) {
  const isPdf =
    payment.receiptUrl?.startsWith('data:application/pdf') ||
    payment.receiptName?.toLowerCase().endsWith('.pdf');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
              {payment.receiptName || 'Payment Receipt'}
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">
              Ref: {payment.reference} &bull; {naira(payment.amount)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl font-bold p-1"
          >
            &times;
          </button>
        </div>

        {payment.isReceiptArchived || !payment.receiptUrl ? (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-6 text-center space-y-3">
            <Archive className="w-10 h-10 text-amber-600 dark:text-amber-400 mx-auto" />
            <h4 className="font-extrabold text-sm text-amber-900 dark:text-amber-200">
              Receipt File Archived (3-Month Retention Policy)
            </h4>
            <p className="text-xs text-amber-700 dark:text-amber-300 max-w-md mx-auto leading-relaxed">
              In accordance with church financial storage guidelines, original receipt files for settled transactions are archived after 90 days.
              Your payment record, reference number, amount paid, and verification audit trail remain permanently preserved.
            </p>
            {payment.receiptRetentionUntil && (
              <p className="text-[11px] text-amber-600/80 font-mono">
                Archived after: {new Date(payment.receiptRetentionUntil).toLocaleDateString()}
              </p>
            )}
          </div>
        ) : (
          <div className="min-h-[300px] max-h-[65vh] overflow-auto flex items-center justify-center bg-slate-100 dark:bg-slate-950 rounded-xl p-2">
            {isPdf ? (
              <iframe
                src={payment.receiptUrl!}
                className="w-full h-[60vh] rounded-lg border border-slate-200"
                title={payment.receiptName || 'Receipt PDF'}
              />
            ) : (
              <img
                src={payment.receiptUrl!}
                alt={payment.receiptName || 'Receipt'}
                className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-sm"
              />
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="text-[11px] text-slate-400">
            {payment.receiptUrl && !payment.isReceiptArchived && (
              <span>Policy: Active 3-Month Retention</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs"
            >
              Close
            </button>
            {payment.receiptUrl && !payment.isReceiptArchived && (
              <>
                <a
                  href={payment.receiptUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in Tab</span>
                </a>
                <a
                  href={payment.receiptUrl!}
                  download={payment.receiptName || 'payment-receipt'}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
