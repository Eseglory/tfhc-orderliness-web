'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  History,
  ArrowLeft,
  CheckCircle2,
  Clock,
  XCircle,
  Receipt,
  Search,
  Filter,
  Download,
  ExternalLink,
  DollarSign,
  AlertCircle,
  Calendar,
  Archive,
} from 'lucide-react';
import { LogoIcon } from '../../../../components/LogoIcon';
import { fetchApi } from '../../../../lib/api';
import { PageLoader, useToast } from '../../../../components/ui';
import { MemberFinanceNav } from '../../../../components/member/MemberFinanceNav';

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;

interface Payment {
  id: string;
  reference: string;
  amount: number;
  purpose: string;
  status: string;
  method: string;
  paidOn: string;
  payerReference?: string | null;
  description?: string | null;
  duesPeriod: string | null;
  receiptUrl?: string | null;
  receiptName?: string | null;
  isReceiptArchived?: boolean;
  receiptArchivedReason?: string | null;
  receiptRetentionUntil?: string | null;
  receiptOriginalSize?: number | null;
  receiptOptimizedSize?: number | null;
  receiptCompressionRatio?: number | null;
  rejectionReason?: string | null;
  createdAt?: string;
  confirmedAt?: string | null;
  amountPayable?: number | null;
  amountPaid?: number;
  claimedAmount?: number;
  confirmedAmount?: number;
  isAdjusted?: boolean;
  adminNote?: string | null;
  assignmentStatus?: string | null;
  assignmentBalance?: number | null;
}

export default function MemberPaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [purposeFilter, setPurposeFilter] = useState<'ALL' | 'MONTHLY_DUES' | 'SPECIAL_CONTRIBUTION'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CONFIRMED' | 'PENDING' | 'REJECTED'>('ALL');
  const [search, setSearch] = useState('');
  const [viewingReceipt, setViewingReceipt] = useState<Payment | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchApi<Payment[]>('/me/finance/payments');
      setPayments(data);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load payment history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (purposeFilter !== 'ALL' && p.purpose !== purposeFilter) return false;
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesRef = p.reference.toLowerCase().includes(q);
        const matchesPayer = p.payerReference?.toLowerCase().includes(q) ?? false;
        const matchesDesc = p.description?.toLowerCase().includes(q) ?? false;
        const matchesPeriod = p.duesPeriod?.toLowerCase().includes(q) ?? false;
        if (!matchesRef && !matchesPayer && !matchesDesc && !matchesPeriod) return false;
      }
      return true;
    });
  }, [payments, purposeFilter, statusFilter, search]);

  const stats = useMemo(() => {
    const verifiedAmount = payments
      .filter((p) => p.status === 'CONFIRMED')
      .reduce((sum, p) => sum + p.amount, 0);
    const pendingCount = payments.filter((p) => p.status === 'PENDING').length;
    const pendingAmount = payments
      .filter((p) => p.status === 'PENDING')
      .reduce((sum, p) => sum + p.amount, 0);
    const rejectedCount = payments.filter((p) => p.status === 'REJECTED').length;
    return { verifiedAmount, pendingCount, pendingAmount, rejectedCount };
  }, [payments]);

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
              Payment History
            </h1>
            <p className="text-[10px] text-slate-400 font-medium">Receipts &amp; Verification Status</p>
          </div>
        </div>
        <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700 p-1">
          <LogoIcon alt="TFHC Logo" className="w-full h-full object-contain" />
        </div>
      </header>

      {/* Sub-Navigation */}
      <MemberFinanceNav
        active="payments"
        pendingPaymentsCount={stats.pendingCount}
      />

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-5">
        {/* Summary KPI Cards */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <span className="text-[10px] font-black uppercase text-slate-400 block">Total Verified</span>
            <span className="text-base sm:text-lg font-black text-emerald-600">
              {naira(stats.verifiedAmount)}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Credited to obligations</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <span className="text-[10px] font-black uppercase text-slate-400 block">Pending Review</span>
            <span className="text-base sm:text-lg font-black text-amber-600">
              {stats.pendingCount}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">{naira(stats.pendingAmount)} volume</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <span className="text-[10px] font-black uppercase text-slate-400 block">Rejected</span>
            <span className="text-base sm:text-lg font-black text-rose-600">
              {stats.rejectedCount}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Submissions denied</span>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by transaction reference or note…"
              className="w-full bg-transparent text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-xs text-slate-400 font-bold p-1">
                Clear
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            {/* Purpose Filter */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-slate-400 mr-1">Category:</span>
              {[
                { id: 'ALL', label: 'All' },
                { id: 'MONTHLY_DUES', label: 'Monthly Dues' },
                { id: 'SPECIAL_CONTRIBUTION', label: 'Special Contributions' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setPurposeFilter(tab.id as any)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                    purposeFilter === tab.id
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-slate-400 mr-1">Status:</span>
              {[
                { id: 'ALL', label: 'All' },
                { id: 'CONFIRMED', label: 'Confirmed' },
                { id: 'PENDING', label: 'Pending' },
                { id: 'REJECTED', label: 'Rejected' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id as any)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors ${
                    statusFilter === tab.id
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Transactions List */}
        {loading ? (
          <PageLoader message="Loading transaction history…" minHeight={200} />
        ) : error ? (
          <div className="p-4 rounded-xl bg-rose-50 text-rose-700 text-sm">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
            <History className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <h3 className="font-bold text-slate-700 dark:text-slate-300">No Payment Records Found</h3>
            <p className="text-xs text-slate-400">
              {payments.length === 0
                ? 'You have not submitted any payment declarations yet.'
                : 'No transactions match the selected filters.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => {
              const isConfirmed = p.status === 'CONFIRMED';
              const isPending = p.status === 'PENDING';
              const isRejected = p.status === 'REJECTED';

              return (
                <article
                  key={p.id}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {p.isAdjusted ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-base text-emerald-600 dark:text-emerald-400">
                              {naira(p.confirmedAmount ?? p.amount)}
                            </span>
                            <span className="text-xs text-slate-400 line-through">
                              Claimed: {naira(p.claimedAmount ?? p.amount)}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              Adjusted by Admin
                            </span>
                          </div>
                        ) : (
                          <span className="font-extrabold text-base text-slate-900 dark:text-white">
                            {naira(p.amount)}
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            p.purpose === 'MONTHLY_DUES'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                              : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                          }`}
                        >
                          {p.purpose === 'MONTHLY_DUES' ? 'Monthly Dues' : 'Special Contribution'}
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {p.duesPeriod ? p.duesPeriod : p.purpose.replace('_', ' ')}
                        {p.amountPayable ? ` • Total Payable: ${naira(p.amountPayable)}` : ''}
                      </p>

                      <p className="text-[11px] text-slate-400 font-mono">
                        Ref: {p.reference} &bull; Method: {p.method.replace('_', ' ')}
                      </p>
                    </div>

                    <div className="text-right shrink-0 space-y-1">
                      {isConfirmed ? (
                        p.assignmentStatus === 'PARTIALLY_PAID' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                            <Clock className="w-3.5 h-3.5" /> Partially Paid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Fully Paid
                          </span>
                        )
                      ) : isPending ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          <Clock className="w-3.5 h-3.5" /> Pending Review
                        </span>
                      ) : isRejected ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                          <XCircle className="w-3.5 h-3.5" /> Rejected
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                          {p.status}
                        </span>
                      )}

                      <p className="text-[10px] text-slate-400 block">
                        {new Date(p.paidOn).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Admin Discrepancy Note or Adjustment Explanation */}
                  {p.adminNote && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs space-y-1">
                      <span className="text-[10px] font-black uppercase text-amber-800 dark:text-amber-300 block">
                        Administrator Verification Note / Comment:
                      </span>
                      <p className="text-amber-900 dark:text-amber-200 font-medium">
                        &quot;{p.adminNote}&quot;
                      </p>
                    </div>
                  )}

                  {/* Outstanding Balance remaining if partially paid */}
                  {isConfirmed && p.assignmentBalance !== null && p.assignmentBalance !== undefined && p.assignmentBalance > 0 && (
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-300 font-semibold">Remaining Balance Outstanding:</span>
                      <span className="text-rose-600 dark:text-rose-400 font-black text-sm">{naira(p.assignmentBalance)}</span>
                    </div>
                  )}

                  {/* Payment Note or Payer Reference */}
                  {(p.description || p.payerReference) && (
                    <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 space-y-0.5">
                      {p.payerReference && (
                        <p className="text-[11px]">
                          <strong>Sender / Narration:</strong> {p.payerReference}
                        </p>
                      )}
                      {p.description && (
                        <p className="text-[11px] italic">
                          <strong>Note:</strong> {p.description}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Rejection Reason if Rejected */}
                  {isRejected && p.rejectionReason && (
                    <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300">
                      <strong>Rejection Reason from Treasury:</strong> {p.rejectionReason}
                    </div>
                  )}

                  {/* Receipt Action */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[11px] text-slate-400">
                      {isConfirmed && p.confirmedAt ? (
                        <span>
                          Verified on{' '}
                          {new Date(p.confirmedAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      ) : isPending ? (
                        <span>Awaiting confirmation by unit finance</span>
                      ) : null}
                    </span>

                    {p.receiptUrl && (
                      <button
                        onClick={() => setViewingReceipt(p)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300 text-xs font-bold transition-colors cursor-pointer"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>View Receipt</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Receipt Viewer Modal */}
      {viewingReceipt && (
        <ReceiptModal
          payment={viewingReceipt}
          onClose={() => setViewingReceipt(null)}
        />
      )}
    </div>
  );
}

function ReceiptModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
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
              In accordance with financial storage retention guidelines, original receipt files for settled transactions are archived after 90 days.
              Your transaction record, payment reference, and verified financial ledger history remain permanently preserved.
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
