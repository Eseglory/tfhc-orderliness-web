'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchApi } from '../../lib/api';

interface Campaign {
  id: string;
  periodId: string;
  title: string;
  description: string | null;
  deadline: string;
  showAsAlert: boolean;
  amountDue: number;
  balance: number;
  status: string;
  paymentAccount: { bankName: string; accountName: string; accountNumber: string } | null;
}

const naira = (n: number) => `₦${Math.round(n).toLocaleString()}`;

/** Calendar-day key (member's local time) so a dismissal only lasts for today. */
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const dismissKey = (campaignId: string) => `tfhc_campaign_alert_dismissed_${campaignId}`;

/**
 * A pop-up (not just an in-flow card) for open, outstanding SPECIAL dues
 * campaigns flagged `showAsAlert` — e.g. a Christmas Party contribution.
 * Reappears every calendar day until paid; a member can close today's popup,
 * but it comes back tomorrow while a balance remains.
 */
export function CampaignAlert() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  useEffect(() => {
    fetchApi<Campaign[]>('/me/finance/campaigns')
      .then((rows) => {
        const due = rows.find((c) => {
          if (!c.showAsAlert || c.balance <= 0 || ['EXEMPT', 'WAIVED'].includes(c.status)) return false;
          try {
            return localStorage.getItem(dismissKey(c.id)) !== todayKey();
          } catch {
            return true;
          }
        });
        setCampaign(due ?? null);
      })
      .catch(() => setCampaign(null));
  }, []);

  if (!campaign) return null;

  const dismiss = () => {
    try { localStorage.setItem(dismissKey(campaign.id), todayKey()); } catch { /* private mode */ }
    setCampaign(null);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-red-200/80 dark:border-red-900/60 bg-gradient-to-r from-red-50/90 via-orange-50/50 to-white dark:from-red-950/40 dark:via-slate-900 dark:to-slate-900 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f2320c] text-white shadow-sm shadow-red-500/20">
            <span className="material-symbols-outlined text-xl">campaign</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">
                {campaign.title}
              </h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-900/60 text-[#f2320c] dark:text-red-400">
                Action Required
              </span>
            </div>
            {campaign.description && (
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                {campaign.description}
              </p>
            )}
            <p className="mt-1.5 text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
              <span className="text-[#f2320c] font-black">{naira(campaign.balance)} outstanding</span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Due by {new Date(campaign.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </p>
            {campaign.paymentAccount && (
              <div className="mt-2 text-[11px] text-slate-600 dark:text-slate-400 bg-white/80 dark:bg-slate-800/80 p-2 rounded-lg border border-slate-200/60 dark:border-slate-700">
                <span className="font-semibold">{campaign.paymentAccount.bankName}</span> • <span>{campaign.paymentAccount.accountName}</span> • <span className="font-mono font-bold text-slate-900 dark:text-white">{campaign.paymentAccount.accountNumber}</span>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={dismiss}
          aria-label="Dismiss today"
          className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 pt-2 border-t border-red-100/80 dark:border-red-900/40">
        <button
          onClick={dismiss}
          className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          Remind me later
        </button>
        <Link
          href="/member/dues"
          onClick={dismiss}
          className="px-4 py-1.5 rounded-xl bg-[#f2320c] hover:bg-[#d82a08] text-white font-bold text-xs shadow-xs transition-transform active:scale-95 flex items-center gap-1"
        >
          <span>View &amp; Pay</span>
          <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </Link>
      </div>
    </div>
  );
}
