'use client';
import React from 'react';

export interface ApprovalStepView {
  order: number;
  name: string;
  state: 'approved' | 'rejected' | 'current' | 'waiting' | 'skipped';
  decidedAt: string | null;
  comment: string | null;
}

const DOT: Record<ApprovalStepView['state'], string> = {
  approved: 'bg-tertiary text-on-tertiary',
  rejected: 'bg-error text-on-error',
  current: 'bg-primary text-on-primary ring-4 ring-primary/15',
  waiting: 'bg-surface-container-high text-on-surface-variant',
  skipped: 'bg-surface-container text-on-surface-variant/50',
};
const ICON: Record<ApprovalStepView['state'], string> = {
  approved: 'check',
  rejected: 'close',
  current: 'hourglass_top',
  waiting: 'more_horiz',
  skipped: 'remove',
};

export function ApprovalTimeline({ steps }: { steps: ApprovalStepView[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={s.order} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full ${DOT[s.state]}`}>
              <span className="material-symbols-outlined text-[16px]">{ICON[s.state]}</span>
            </span>
            {i < steps.length - 1 && <span className="mt-1 w-px flex-1 bg-outline-variant/30" />}
          </div>
          <div className="pb-1">
            <p className="text-sm font-semibold text-on-surface">{s.name}</p>
            <p className="text-xs capitalize text-on-surface-variant">
              {s.state}
              {s.decidedAt ? ` · ${new Date(s.decidedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
            </p>
            {s.comment && <p className="mt-0.5 text-xs text-on-surface-variant">“{s.comment}”</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
