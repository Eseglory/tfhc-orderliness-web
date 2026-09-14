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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-inverse-surface/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-surface-container-lowest p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <span className="material-symbols-outlined text-3xl text-primary">campaign</span>
          <button onClick={dismiss} aria-label="Close" className="rounded-full p-1 text-on-surface-variant hover:bg-surface-container">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <h2 className="mt-2 text-lg font-bold text-on-surface">{campaign.title}</h2>
        {campaign.description && <p className="mt-1 text-sm text-on-surface-variant">{campaign.description}</p>}
        <p className="mt-3 text-sm font-semibold text-on-surface">
          {naira(campaign.balance)} outstanding
          <span className="font-normal text-on-surface-variant">
            {' '}· Deadline {new Date(campaign.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </p>
        {campaign.paymentAccount && (
          <div className="mt-3 rounded-lg bg-surface-container-low p-3 text-xs">
            <p className="font-semibold text-on-surface">{campaign.paymentAccount.bankName}</p>
            <p>{campaign.paymentAccount.accountName}</p>
            <p className="font-mono">{campaign.paymentAccount.accountNumber}</p>
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <button onClick={dismiss} className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container">
            Remind me tomorrow
          </button>
          <Link
            href="/member/dues"
            onClick={dismiss}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-semibold text-on-primary"
          >
            View &amp; pay
          </Link>
        </div>
      </div>
    </div>
  );
}
