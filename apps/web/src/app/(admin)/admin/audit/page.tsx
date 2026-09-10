'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  Shield,
  Clock,
  User,
  ChevronDown,
  ChevronUp,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { Badge, Button, EmptyState, Spinner } from '../../../../components/ui';
import { fetchApi, ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';

interface AuditItem {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  reason: string | null;
  previousData: unknown;
  newData: unknown;
  createdAt: string;
  actor: { email: string | null; name: string | null };
}

const ENTITIES = ['', 'User', 'AccessRole', 'Member', 'Meeting', 'AttendanceRecord', 'AbsenceExcuse', 'CorrectionRequest'];

export default function AuditLogPage() {
  const { loading: authLoading } = useAuth();
  const [items, setItems] = useState<AuditItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [entity, setEntity] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(
    async (reset: boolean) => {
      reset ? setLoading(true) : setLoadingMore(true);
      try {
        const params = new URLSearchParams();
        if (entity) params.set('entity', entity);
        if (!reset && cursor) params.set('cursor', cursor);
        const res = await fetchApi<{ items: AuditItem[]; nextCursor: string | null }>(`/audit-logs?${params}`);
        setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
        setCursor(res.nextCursor);
        setError('');
      } catch (e) {
        setError(e instanceof ApiError && e.status === 403 ? 'You do not have access to the audit log.' : 'Could not load the audit log.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [entity, cursor],
  );

  useEffect(() => {
    if (!authLoading) load(true);
  }, [authLoading, entity]);

  return (
    <AdminLayoutShell activeHref="/admin/settings">
      <div className="space-y-6 pb-16">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <Link href="/admin/settings" className="hover:text-indigo-600 transition-colors">SETTINGS</Link>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">SECURITY AUDIT LOGS</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                System Security &amp; Audit Trail
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Immutable chronological record of administrative actions, data modifications, and security events.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => load(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              Refresh Log
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-500">Filter By Target Entity:</span>
            <select
              value={entity}
              onChange={(e) => {
                setCursor(null);
                setEntity(e.target.value);
              }}
              className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none"
            >
              {ENTITIES.map((e) => (
                <option key={e} value={e}>
                  {e ? e : 'All Target Entities'}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs text-slate-400 font-bold">{items.length} records loaded</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-24 text-slate-400"><Spinner /></div>
        ) : error ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={() => load(true)}>Retry</Button>} />
        ) : items.length === 0 ? (
          <EmptyState title="No Audit Log Entries" description="Administrative actions and changes will appear here automatically." />
        ) : (
          <ul className="space-y-3">
            {items.map((it) => (
              <li
                key={it.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3 transition-all"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone="info">{it.action}</Badge>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {it.entity}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">
                      {it.entityId.slice(0, 8)}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-slate-400">
                    {new Date(it.createdAt).toLocaleString()}
                  </span>
                </div>

                <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-bold text-slate-900 dark:text-white">{it.actor.name || it.actor.email || 'System'}</span>
                  {it.reason && <span className="text-slate-400 font-normal"> — {it.reason}</span>}
                </div>

                {(it.previousData != null || it.newData != null) && (
                  <div>
                    <button
                      onClick={() => setExpanded(expanded === it.id ? null : it.id)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      {expanded === it.id ? (
                        <>Hide Detailed Payload <ChevronUp className="w-3.5 h-3.5" /></>
                      ) : (
                        <>View Detailed Changes <ChevronDown className="w-3.5 h-3.5" /></>
                      )}
                    </button>
                  </div>
                )}

                {expanded === it.id && (
                  <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                    <div className="space-y-1">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Previous State</span>
                      <pre className="overflow-x-auto rounded-xl bg-slate-50 dark:bg-slate-950 p-3 text-[11px] font-mono border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                        {JSON.stringify(it.previousData ?? {}, null, 2)}
                      </pre>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">New State</span>
                      <pre className="overflow-x-auto rounded-xl bg-slate-50 dark:bg-slate-950 p-3 text-[11px] font-mono border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                        {JSON.stringify(it.newData ?? {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {cursor && !loading && (
          <div className="flex justify-center pt-2">
            <button
              disabled={loadingMore}
              onClick={() => load(false)}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition-all"
            >
              {loadingMore ? 'Loading records…' : 'Load More Audit Entries'}
            </button>
          </div>
        )}
      </div>
    </AdminLayoutShell>
  );
}

