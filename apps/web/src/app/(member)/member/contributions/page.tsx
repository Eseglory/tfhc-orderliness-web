'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  ArrowLeft,
  Copy,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Upload,
  Receipt,
  ExternalLink,
  ShieldAlert,
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
  description?: string | null;
  rejectionReason?: string | null;
}

export default function MemberContributionsPage() {
  const router = useRouter();
  const { notify } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [declaring, setDeclaring] = useState<Campaign | null>(null);
  const [copiedAccount, setCopiedAccount] = useState<string | null>(null);

  const load = async () => {
    try {
      const [c, p] = await Promise.all([
        fetchApi<Campaign[]>('/me/finance/campaigns'),
        fetchApi<Payment[]>('/me/finance/payments'),
      ]);
      setCampaigns(c);
      setPayments(p.filter((x) => x.purpose === 'SPECIAL_CONTRIBUTION'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your contributions.');
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

  const activeOwing = campaigns.filter((c) => c.balance > 0 && !['EXEMPT', 'WAIVED'].includes(c.status));
  const totalBalance = activeOwing.reduce((s, c) => s + c.balance, 0);

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
              Other Contributions
            </h1>
            <p className="text-[10px] text-slate-400 font-medium">Special Drives &amp; Celebrations</p>
          </div>
        </div>
        <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700 p-1">
          <LogoIcon alt="TFHC Logo" className="w-full h-full object-contain" />
        </div>
      </header>

      {/* Sub-Navigation */}
      <MemberFinanceNav
        active="contributions"
        activeCampaignsCount={activeOwing.length}
      />

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-5">
        {/* Banner Explaining Other Contributions */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50/90 via-purple-50/60 to-white dark:from-indigo-950/40 dark:via-purple-950/20 dark:to-slate-900 border border-indigo-200/80 dark:border-indigo-800/60 shadow-xs flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-600 text-white shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Approved Special Drives &amp; Celebrations
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
              These contributions (such as the <strong>Christmas Party Contribution</strong>, building projects, and unit drives) are completely separate from your monthly membership dues. Each contribution has its own dedicated bank account.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            <PageLoader
              message="Loading contributions…"
              description="Connecting to active campaigns and records"
              minHeight={200}
            />
            <CardSkeleton count={2} gridCols="grid-cols-1" />
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>
        ) : campaigns.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
            <Sparkles className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <h3 className="font-bold text-slate-700 dark:text-slate-300">No Special Contributions Active</h3>
            <p className="text-xs text-slate-400">There are currently no active special drives or celebration contributions.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map((c) => {
              const isPaid = c.status === 'PAID';
              const isWaived = c.status === 'WAIVED' || c.status === 'EXEMPT';
              const isPending = payments.some((p) => p.duesPeriod === c.title && p.status === 'PENDING');

              return (
                <article
                  key={c.id}
                  className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-black text-slate-900 dark:text-white">
                          {c.title}
                        </h3>
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Fully Paid
                          </span>
                        ) : isPending ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-300">
                            <Clock className="w-3.5 h-3.5" /> Receipt Under Review
                          </span>
                        ) : isWaived ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-300">
                            Waived
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            <AlertTriangle className="w-3.5 h-3.5" /> Action Required
                          </span>
                        )}
                      </div>

                      {c.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {c.description}
                        </p>
                      )}

                      <p className="text-xs text-slate-400">
                        Deadline:{' '}
                        <strong>
                          {new Date(c.deadline).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </strong>
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Contribution Amount</span>
                      <span className="text-xl font-black text-slate-900 dark:text-white">
                        {naira(c.amountDue)}
                      </span>
                      {c.balance > 0 && !isWaived && (
                        <span className="text-xs font-bold text-rose-600 block mt-0.5">
                          {naira(c.balance)} outstanding
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Designated Bank Account for this Specific Campaign */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Designated Payment Account for this Contribution
                      </span>
                      {c.paymentAccount && (
                        <button
                          onClick={() => copyNumber(c.paymentAccount!.accountNumber)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{copiedAccount === c.paymentAccount.accountNumber ? 'Copied!' : 'Copy Account'}</span>
                        </button>
                      )}
                    </div>

                    {c.paymentAccount ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                        <span className="font-bold text-slate-900 dark:text-white">{c.paymentAccount.bankName}</span>
                        <span>&bull;</span>
                        <span className="text-slate-600 dark:text-slate-300">{c.paymentAccount.accountName}</span>
                        <span>&bull;</span>
                        <span className="font-mono font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                          {c.paymentAccount.accountNumber}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                        <ShieldAlert className="w-4 h-4 shrink-0" />
                        <span>No specific receiving account attached yet. Please consult unit treasury.</span>
                      </div>
                    )}

                    {c.paymentAccount?.instructions && (
                      <p className="text-[11px] text-slate-500 italic mt-1">
                        Instruction: {c.paymentAccount.instructions}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-xs text-slate-500">
                      Paid so far: <strong>{naira(c.amountPaid)}</strong>
                    </span>

                    {c.balance > 0 && !isWaived && (
                      <button
                        onClick={() => setDeclaring(c)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-sm transition-transform active:scale-95 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>I&apos;ve Paid &bull; Upload Receipt</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Payment Declaration Modal */}
      {declaring && (
        <DeclareContributionModal
          campaign={declaring}
          onClose={() => setDeclaring(null)}
          onDone={() => {
            setDeclaring(null);
            notify('Payment submitted for confirmation!', 'success');
            load();
          }}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// DECLARE CONTRIBUTION MODAL
// ----------------------------------------------------------------------------
function DeclareContributionModal({
  campaign,
  onClose,
  onDone,
}: {
  campaign: Campaign;
  onClose: () => void;
  onDone: () => void;
}) {
  const { notify } = useToast();
  const [amount, setAmount] = useState<number>(campaign.balance);
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
          purpose: 'SPECIAL_CONTRIBUTION',
          method,
          amount: Number(amount),
          duesAssignmentId: campaign.id,
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
              Confirm Contribution Payment
            </h3>
            <p className="text-xs text-slate-500">{campaign.title}</p>
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
              Supports photos/screenshots (JPG, PNG, WebP) and PDF documents up to 10MB. Automatically compressed to speed up uploads.
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
              placeholder="e.g. Paid for Christmas party contribution via mobile banking"
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
