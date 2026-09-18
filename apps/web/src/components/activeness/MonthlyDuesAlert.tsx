'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchApi } from '../../lib/api';

interface DuesItem {
  id: string;
  period: string;
  amountDue: number;
  amountPaid: number;
  balance: number;
  dueDate: string;
  status: string;
}

interface PaymentAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  instructions: string | null;
}

const naira = (n: number) => `₦${Math.round(n).toLocaleString()}`;

/** Calendar-day key (member's local time) so a dismissal only lasts for today. */
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DISMISS_KEY = 'tfhc_monthly_dues_alert_dismissed';

export function MonthlyDuesAlert() {
  const [unpaidDues, setUnpaidDues] = useState<DuesItem[]>([]);
  const [account, setAccount] = useState<PaymentAccount | null>(null);
  const [visible, setVisible] = useState(false);

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
        const owing = Array.isArray(duesList)
          ? duesList.filter((d) => d.balance > 0 && !['EXEMPT', 'WAIVED', 'PAID'].includes(d.status))
          : [];

        if (owing.length > 0) {
          setUnpaidDues(owing);
          if (Array.isArray(accounts) && accounts.length > 0) {
            setAccount(accounts[0]);
          }
          setVisible(true);
        }
      })
      .catch(() => {
        setVisible(false);
      });
  }, []);

  if (!visible || unpaidDues.length === 0) return null;

  const totalBalance = unpaidDues.reduce((sum, d) => sum + d.balance, 0);
  const periodsStr = unpaidDues.map((d) => d.period).join(', ');

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, todayKey());
    } catch {
      // ignore
    }
    setVisible(false);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-amber-300/80 dark:border-amber-800/80 bg-gradient-to-r from-amber-50/95 via-orange-50/80 to-white dark:from-amber-950/40 dark:via-slate-900 dark:to-slate-900 p-4 sm:p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-600 text-white shadow-sm shadow-amber-600/30 mt-0.5">
            <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm sm:text-base font-extrabold text-[#0b1c30] dark:text-white leading-tight">
                Monthly Dues Reminder
              </h4>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                {unpaidDues.length} {unpaidDues.length === 1 ? 'Month' : 'Months'} Unpaid
              </span>
            </div>

            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              You have an outstanding monthly dues balance for{' '}
              <span className="font-bold text-[#0b1c30] dark:text-white">{periodsStr}</span>.
            </p>

            <div className="pt-1 flex items-baseline gap-2 flex-wrap">
              <span className="text-lg sm:text-xl font-black text-amber-700 dark:text-amber-400">
                {naira(totalBalance)}
              </span>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">total balance due</span>
            </div>

            {account && (
              <div className="mt-2 text-xs text-slate-700 dark:text-slate-300 bg-white/90 dark:bg-slate-800/90 p-2.5 rounded-xl border border-amber-200/60 dark:border-amber-900/40 space-y-0.5">
                <p className="font-bold text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Transfer Account:
                </p>
                <p className="font-medium flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-slate-900 dark:text-white">{account.bankName}</span>
                  <span>•</span>
                  <span>{account.accountName}</span>
                  <span>•</span>
                  <span className="font-mono font-black text-slate-900 dark:text-white bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                    {account.accountNumber}
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={dismiss}
          aria-label="Dismiss today"
          className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      <div className="mt-4 flex items-center justify-end gap-3 pt-2.5 border-t border-amber-200/60 dark:border-amber-900/40">
        <button
          onClick={dismiss}
          className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          Remind me tomorrow
        </button>
        <Link
          href="/member/dues"
          onClick={dismiss}
          className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs shadow-sm transition-transform active:scale-95 flex items-center gap-1.5"
        >
          <span>Pay &amp; Declare Dues</span>
          <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </Link>
      </div>
    </div>
  );
}
