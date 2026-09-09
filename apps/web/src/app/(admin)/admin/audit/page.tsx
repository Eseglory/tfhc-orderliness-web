'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '../../../../components/Navbar';
import { Badge, Button, EmptyState, PageHeader, Spinner } from '../../../../components/ui';
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, entity]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
        <nav className="text-xs text-on-surface-variant">
          <Link href="/admin" className="hover:text-primary">Dashboard</Link>
          <span className="mx-1.5">/</span>
          <span className="text-on-surface">Audit Log</span>
        </nav>
        <PageHeader title="Audit Log" subtitle="An append-only record of sensitive administrative actions." />

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-on-surface-variant">Entity</label>
          <select
            value={entity}
            onChange={(e) => {
              setCursor(null);
              setEntity(e.target.value);
            }}
            className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 py-2 text-sm"
          >
            {ENTITIES.map((e) => (
              <option key={e} value={e}>
                {e || 'All'}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-16 text-on-surface-variant"><Spinner /></div>
        ) : error ? (
          <EmptyState title="Unavailable" description={error} action={<Button variant="secondary" onClick={() => load(true)}>Retry</Button>} />
        ) : items.length === 0 ? (
          <EmptyState title="No audit entries" description="Actions will appear here as administrators use the system." />
        ) : (
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.id} className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 text-sm shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">{it.action}</Badge>
                  <span className="text-on-surface-variant">
                    {it.entity}
                    <span className="mx-1 opacity-40">·</span>
                    <span className="font-mono text-xs">{it.entityId.slice(0, 8)}</span>
                  </span>
                  <span className="ml-auto text-xs text-on-surface-variant">
                    {new Date(it.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-on-surface">
                  {it.actor.name || it.actor.email || 'System'}
                  {it.reason && <span className="text-on-surface-variant"> — {it.reason}</span>}
                </p>
                {(it.previousData != null || it.newData != null) && (
                  <button
                    onClick={() => setExpanded(expanded === it.id ? null : it.id)}
                    className="mt-1 text-xs font-semibold text-primary hover:underline"
                  >
                    {expanded === it.id ? 'Hide changes' : 'View changes'}
                  </button>
                )}
                {expanded === it.id && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <pre className="overflow-x-auto rounded-lg bg-surface-container-low p-2 text-[11px]">
                      {JSON.stringify(it.previousData ?? {}, null, 2)}
                    </pre>
                    <pre className="overflow-x-auto rounded-lg bg-surface-container-low p-2 text-[11px]">
                      {JSON.stringify(it.newData ?? {}, null, 2)}
                    </pre>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {cursor && !loading && (
          <div className="flex justify-center">
            <Button variant="secondary" loading={loadingMore} onClick={() => load(false)}>
              Load more
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
