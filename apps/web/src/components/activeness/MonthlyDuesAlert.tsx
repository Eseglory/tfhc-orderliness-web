'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  AlertTriangle,
  ArrowRight,
  X,
  Copy,
  CheckCircle2,
  Clock,
  ShieldCheck,
  CreditCard,
} from 'lucide-react';
import { fetchApi } from '../../lib/api';

interface DuesItem {
  id: string;
  period: string;
  amountDue: number;
  amountPaid: number;
  balance: number;
  dueDate: string;
  status: string;
  category?: 'Executive' | 'Regular';
  monthlyRate?: number;
  hasPendingPayment?: boolean;
  paymentAccount?: PaymentAccount | null;
}

interface PaymentAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  instructions: string | null;
}

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;

/** Calendar-day key (member's local time) so a dismissal only lasts for today. */
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DISMISS_KEY = 'tfhc_monthly_dues_alert_dismissed';

export function MonthlyDuesAlert() {
  const [unpaidDues, setUnpaidDues] = useState<DuesItem[]>([]);
  const [account, setAccount] = useState<PaymentAccount | null>(null);
  const [category, setCategory] = useState<'Executive' | 'Regular'>('Regular');
  const [monthlyRate, setMonthlyRate] = useState<number>(2000);
  const [hasPendingReceipts, setHasPendingReceipts] = useState(false);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Check if dismissed today
    try {
      if (localStorage.getItem(DISMISS_KEY) === todayKey()) {
        return;
      }
    } catch {
      // ignore private storage errors
    }

    Promise.all([
      fetchApi<DuesItem[]>('/me/finance/dues').catch(() => []),
      fetchApi<PaymentAccount[]>('/me/finance/payment-accounts').catch(() => []),
    ])
      .then(([duesList, accounts]) => {
        if (!Array.isArray(duesList) || duesList.length === 0) {
          setVisible(false);
          return;
        }

        // Strictly exclude waived and exempt months; only count actual unpaid balance
        const owing = duesList.filter(
          (d) => d.balance > 0 && !['EXEMPT', 'WAIVED', 'PAID'].includes(d.status)
        );

        if (owing.length > 0) {
          setUnpaidDues(owing);
          setCategory(duesList[0]?.category || 'Regular');
          setMonthlyRate(duesList[0]?.monthlyRate || (duesList[0]?.category === 'Executive' ? 2500 : 2000));
          setHasPendingReceipts(owing.some((d) => d.hasPendingPayment));

          const designated = owing[0]?.paymentAccount || accounts[0] || null;
          setAccount(designated);
          setVisible(true);
        } else {
          setVisible(false);
        }
      })
      .catch(() => {
        setVisible(false);
      });
  }, []);

  if (!visible || unpaidDues.length === 0) return null;

  const totalBalance = unpaidDues.reduce((sum, d) => sum + d.balance, 0);
  const periodsStr = unpaidDues.map((d) => d.period).join(', ');

  const copyAccountNumber = (num: string) => {
    navigator.clipboard.writeText(num);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, todayKey());
    } catch {
      // ignore
    }
    setVisible(false);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-amber-400 dark:border-amber-700 bg-gradient-to-br from-amber-50 via-orange-50/90 to-white dark:from-amber-950/60 dark:via-slate-900 dark:to-slate-900 p-5 shadow-lg space-y-4">
      {/* Decorative ambient badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-600 text-white shadow-md shadow-amber-600/30">
            <Calendar className="w-6 h-6" />
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-600 text-white shadow-xs">
                Monthly Dues Obligation
              </span>
              <span
                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                  category === 'Executive'
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                    : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                }`}
              >
                {category} Member ({naira(monthlyRate)}/mo)
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                {unpaidDues.length} {unpaidDues.length === 1 ? 'Month' : 'Months'} Unpaid
              </span>
            </div>

            <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-snug">
              You have an outstanding monthly dues balance
            </h3>

            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              Unpaid period(s): <strong className="text-slate-900 dark:text-white">{periodsStr}</strong>.
              Waived months are excluded.
            </p>

            <div className="pt-1 flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-black text-amber-700 dark:text-amber-400">
                {naira(totalBalance)}
              </span>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">total balance due</span>
            </div>

            {hasPendingReceipts && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 text-xs font-semibold mt-1">
                <Clock className="w-3.5 h-3.5" />
                <span>You have receipt(s) submitted currently awaiting treasury verification.</span>
              </div>
            )}

            {account && (
              <div className="mt-3 text-xs text-slate-700 dark:text-slate-300 bg-white/90 dark:bg-slate-800/90 p-3 rounded-xl border border-amber-200 dark:border-amber-800/60 shadow-xs space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-extrabold text-[10px] text-slate-400 uppercase tracking-wider">
                    Designated Transfer Account:
                  </p>
                  <button
                    onClick={() => copyAccountNumber(account.accountNumber)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copied ? 'Copied!' : 'Copy Account'}</span>
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap font-medium">
                  <span className="font-bold text-slate-900 dark:text-white">{account.bankName}</span>
                  <span>&bull;</span>
                  <span>{account.accountName}</span>
                  <span>&bull;</span>
                  <span className="font-mono font-black text-slate-900 dark:text-white bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                    {account.accountNumber}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 pt-0.5">
                  Narration remark: [Your Name or Code] - Monthly Dues
                </p>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={dismiss}
          aria-label="Dismiss today"
          className="rounded-xl p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-amber-200/80 dark:border-amber-800/60">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Monthly dues support orderliness unit welfare, logistics &amp; administration.
        </span>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <button
            onClick={dismiss}
            className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            Remind me tomorrow
          </button>
          <Link
            href="/member/dues"
            onClick={dismiss}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs shadow-sm transition-transform active:scale-95 flex items-center gap-1.5"
          >
            <span>Pay &amp; Upload Receipt</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
