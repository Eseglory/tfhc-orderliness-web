'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '../../../../components/Navbar';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Spinner,
  inputClass,
  useToast,
} from '../../../../components/ui';
import { ApprovalTimeline, ApprovalStepView } from '../../../../components/ApprovalTimeline';
import { fetchApi, ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';

interface ApprovalRequest {
  id: string;
  requestType: string;
  summary: string;
  amount: number | null;
  status: string;
  currentStepOrder: number;
  createdAt: string;
  decidedAt: string | null;
  requester: { name: string; memberCode: string } | null;
  workflow: { key: string; name: string };
  steps: ApprovalStepView[];
}

const TYPE_LABEL: Record<string, string> = {
  ABSENCE: 'Absence',
  WELFARE_FUND: 'Welfare fund',
  EXPENSE: 'Expense',
  DUES_ADJUSTMENT: 'Dues adjustment',
  GENERIC: 'Request',
};

export default function ApprovalsPage() {
  const { can, loading: authLoading } = useAuth();
  const { notify } = useToast();
  const [tab, setTab] = useState<'queue' | 'history' | 'workflows'>('queue');
  const [queue, setQueue] = useState<ApprovalRequest[]>([]);
  const [history, setHistory] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState<{ req: ApprovalRequest; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [q, h] = await Promise.all([
        can('approvals.act') ? fetchApi<ApprovalRequest[]>('/approvals/pending') : Promise.resolve([]),
        can('approvals.read') ? fetchApi<ApprovalRequest[]>('/approvals/history') : Promise.resolve([]),
      ]);
      setQueue(q);
      setHistory(h);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? 'You do not have access to approvals.' : 'Could not load approvals.');
    } finally {
      setLoading(false);
    }
  }, [can]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const submitDecision = async (comment: string) => {
    if (!acting) return;
    setBusy(true);
    try {
      await fetchApi(`/approvals/${acting.req.id}/act`, {
        method: 'POST',
        body: JSON.stringify({ decision: acting.decision, comment: comment || undefined }),
      });
      notify(acting.decision === 'APPROVED' ? 'Approved' : 'Rejected', 'success');
      setActing(null);
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Action failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const rows = tab === 'queue' ? queue : history;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
        <PageHeader title="Approvals" subtitle="Requests awaiting a decision, and the history of every one." />

        <div className="flex gap-1 rounded-xl bg-surface-container p-1">
          {([
            ['queue', `My queue${queue.length ? ` (${queue.length})` : ''}`],
            ['history', 'History'],
            ...(can('approvals.configure') ? [['workflows', 'Workflows'] as const] : []),
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k as typeof tab)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === k ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'workflows' ? (
          <WorkflowsTab />
        ) : loading ? (
          <div className="flex justify-center py-16 text-on-surface-variant"><Spinner /></div>
        ) : error ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={load}>Retry</Button>} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={tab === 'queue' ? 'Nothing waiting on you' : 'No decisions yet'}
            description={tab === 'queue' ? 'Requests that need your approval will show here.' : undefined}
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge tone="info">{TYPE_LABEL[r.requestType] ?? r.requestType}</Badge>
                      {r.amount != null && <span className="text-sm font-bold text-on-surface">₦{r.amount.toLocaleString()}</span>}
                      <Badge tone={r.status === 'APPROVED' ? 'success' : r.status === 'REJECTED' ? 'danger' : r.status === 'CANCELLED' ? 'neutral' : 'warning'}>
                        {r.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm font-medium text-on-surface">{r.summary}</p>
                    <p className="text-xs text-on-surface-variant">
                      {r.requester ? `${r.requester.name} · ${r.requester.memberCode} · ` : ''}
                      {new Date(r.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  {tab === 'queue' && r.status === 'PENDING' && (
                    <div className="flex gap-2">
                      <Button variant="danger" className="text-xs" onClick={() => setActing({ req: r, decision: 'REJECTED' })}>Reject</Button>
                      <Button className="text-xs" onClick={() => setActing({ req: r, decision: 'APPROVED' })}>Approve</Button>
                    </div>
                  )}
                </div>
                <div className="mt-3 border-t border-outline-variant/15 pt-3">
                  <ApprovalTimeline steps={r.steps} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {acting && (
        <DecisionModal
          decision={acting.decision}
          summary={acting.req.summary}
          busy={busy}
          onCancel={() => setActing(null)}
          onConfirm={submitDecision}
        />
      )}
    </div>
  );
}

function DecisionModal({
  decision,
  summary,
  busy,
  onCancel,
  onConfirm,
}: {
  decision: 'APPROVED' | 'REJECTED';
  summary: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (comment: string) => void;
}) {
  const [comment, setComment] = useState('');
  const [err, setErr] = useState('');
  return (
    <Modal
      open
      onClose={onCancel}
      title={decision === 'APPROVED' ? 'Approve this request?' : 'Reject this request?'}
      description={summary}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button
            variant={decision === 'APPROVED' ? 'primary' : 'danger'}
            loading={busy}
            onClick={() => {
              if (decision === 'REJECTED' && !comment.trim()) return setErr('A reason is required to reject.');
              onConfirm(comment.trim());
            }}
          >
            {decision === 'APPROVED' ? 'Approve' : 'Reject'}
          </Button>
        </>
      }
    >
      <Field label={decision === 'APPROVED' ? 'Comment (optional)' : 'Reason'} error={err}>
        <textarea className={inputClass} rows={3} value={comment} onChange={(e) => { setComment(e.target.value); setErr(''); }} maxLength={2000} />
      </Field>
    </Modal>
  );
}

interface Workflow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  requestType: string;
  active: boolean;
  isSystem: boolean;
  requestCount: number;
  steps: { order: number; name: string; approverMode: string; roleKey: string | null; permission: string | null }[];
}

function WorkflowsTab() {
  const { notify } = useToast();
  const [rows, setRows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setRows(await fetchApi<Workflow[]>('/approval-workflows'));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const toggle = async (w: Workflow) => {
    setBusy(w.id);
    try {
      await fetchApi(`/approval-workflows/${w.id}`, { method: 'PATCH', body: JSON.stringify({ active: !w.active }) });
      notify(w.active ? 'Deactivated' : 'Activated — it is now the workflow for this request type', 'success');
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not update', 'error');
    } finally {
      setBusy('');
    }
  };

  if (loading) return <div className="flex justify-center py-16 text-on-surface-variant"><Spinner /></div>;

  const byType = rows.reduce<Record<string, Workflow[]>>((acc, w) => {
    (acc[w.requestType] ??= []).push(w);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <p className="text-sm text-on-surface-variant">
        One workflow is active per request type. Activating a workflow deactivates the others for that type.
        In-flight requests keep their original steps.
      </p>
      {Object.entries(byType).map(([type, list]) => (
        <div key={type}>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-on-surface-variant">{TYPE_LABEL[type] ?? type}</h3>
          <div className="space-y-2">
            {list.map((w) => (
              <div key={w.id} className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-on-surface">{w.name}</span>
                      {w.isSystem && <Badge tone="info">System</Badge>}
                      {w.active ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}
                    </div>
                    <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-on-surface-variant">
                      {w.steps.map((s, i) => (
                        <li key={s.order} className="flex items-center gap-1.5">
                          <span className="rounded-md bg-surface-container px-2 py-0.5 font-medium text-on-surface">
                            {s.order}. {s.name}
                            {s.roleKey ? ` · ${s.roleKey}` : s.permission ? ` · ${s.permission}` : ''}
                          </span>
                          {i < w.steps.length - 1 && <span className="material-symbols-outlined text-[14px]">arrow_forward</span>}
                        </li>
                      ))}
                    </ol>
                  </div>
                  <Button variant="secondary" className="text-xs" loading={busy === w.id} onClick={() => toggle(w)}>
                    {w.active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-on-surface-variant">
        Building a custom workflow with different roles is available via the API (<code>POST /approval-workflows</code>);
        a visual builder is on the roadmap.
      </p>
    </div>
  );
}
