'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '../../../components/Navbar';
import { fetchApi, API_BASE_URL, getAuthToken } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';

type DashboardStats = {
  totalActiveMembers: number;
  meetingsHeld: number;
  avgAttendance: number;
  avgPunctuality: number;
  activeFlagsCount: number;
  pendingExcusesCount: number;
};
type Analytics = {
  services: { id: string; title: string; date: string; attended: number; absent: number; punctual: number; excused: number }[];
  statuses: Record<string, number>;
  totals: { attended: number; punctual: number; absent: number; excused: number };
  attendanceRate: number | null;
  punctualityRate: number | null;
  excuses: Record<string, number>;
};
type ActiveMeeting = { id: string; title: string; locationName: string; geofenceRadiusMeters?: number; attendanceCloseTime?: string } | null;
type Excuse = { id: string; reason: string; category?: string; member: { firstName: string; lastName: string; subTeam?: { name: string } | null }; meeting: { title: string } };
type Correction = { id: string; reason: string; member: { firstName: string; lastName: string } };
type Flag = { id: string; flagLevel: number; flagReason: string; member: { firstName: string; lastName: string; phoneNumber: string; subTeam?: { name: string } | null } };
type LeaderRow = { subTeamName: string; attendanceRate: number; punctualityRate: number; compositeScore: number };

const pct = (n: number | null | undefined) => `${(n ?? 0).toFixed(1)}%`;

/** Inline sparkline — no chart library on the web workspace. */
function Sparkline({ points, className = '' }: { points: number[]; className?: string }) {
  if (points.length < 2) return <div className="h-16" />;
  const w = 260, h = 60, pad = 4;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const xs = (i: number) => pad + (i * (w - pad * 2)) / (points.length - 1);
  const ys = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(v).toFixed(1)}`).join(' ');
  const area = `${d} L ${xs(points.length - 1).toFixed(1)} ${h} L ${xs(0).toFixed(1)} ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`w-full ${className}`} preserveAspectRatio="none" role="img" aria-label="Attendance rate trend">
      <path d={area} fill="var(--spark-fill, rgba(79,70,229,0.12))" />
      <path d={d} fill="none" stroke="var(--spark-stroke, #4f46e5)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((v, i) => <circle key={i} cx={xs(i)} cy={ys(v)} r={i === points.length - 1 ? 3.5 : 2} fill="var(--spark-stroke, #4f46e5)" />)}
    </svg>
  );
}

function StatTile({ label, value, sub, tone = 'default' }: { label: string; value: string; sub?: string; tone?: 'default' | 'good' | 'warn' | 'bad' }) {
  const toneCls = {
    default: 'text-on-surface',
    good: 'text-emerald-600',
    warn: 'text-amber-600',
    bad: 'text-rose-600',
  }[tone];
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className={`mt-1.5 text-2xl font-extrabold ${toneCls}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-on-surface-variant">{sub}</p>}
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant/20 px-4 py-3">
        <h2 className="text-sm font-bold text-on-surface">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [active, setActive] = useState<ActiveMeeting>(null);
  const [liveRecords, setLiveRecords] = useState<{ status: string }[]>([]);
  const [excuses, setExcuses] = useState<Excuse[]>([]);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;
    const get = <T,>(url: string, fallback: T) =>
      fetchApi<T>(url, { signal: ac.signal }).catch(() => fallback);
    (async () => {
      const [s, a, m, ex, co, fl, lb] = await Promise.all([
        get<DashboardStats | null>('/reports/dashboard', null),
        get<Analytics | null>('/reports/analytics?days=30', null),
        get<ActiveMeeting>('/meetings/active', null),
        get<Excuse[]>('/excuses/pending', []),
        get<Correction[]>('/excuses/corrections/pending', []),
        get<Flag[]>('/alerts', []),
        get<LeaderRow[]>('/scoring/leaderboard', []),
      ]);
      if (cancelled) return;
      setStats(s); setAnalytics(a); setActive(m);
      setExcuses(ex || []); setCorrections(co || []); setFlags(fl || []); setLeaders(lb || []);
      setLoading(false);
      if (m?.id) {
        get<{ status: string }[]>(`/attendance/meeting/${m.id}`, []).then((r) => !cancelled && setLiveRecords(r || []));
      }
    })();
    return () => { cancelled = true; ac.abort(); };
  }, []);

  const trajectory = useMemo(() => {
    const s = analytics?.services ?? [];
    return s.map((x) => {
      const expected = x.attended + x.absent;
      return expected ? Math.round((x.attended / expected) * 1000) / 10 : 0;
    });
  }, [analytics]);

  const punctuality = useMemo(() => {
    const st = analytics?.statuses ?? {};
    const onTime = (st.EARLY ?? 0) + (st.ON_TIME ?? 0);
    const grace = (st.GRACE_PERIOD ?? 0) + (st.LATE ?? 0);
    const absent = st.ABSENT ?? 0;
    const total = onTime + grace + absent || 1;
    return { onTime, grace, absent, total, pOn: (onTime / total) * 100, pGrace: (grace / total) * 100, pAbsent: (absent / total) * 100 };
  }, [analytics]);

  const subTeams = useMemo(() => {
    const groups = new Map<string, { n: number; att: number; pun: number }>();
    for (const r of leaders) {
      const g = groups.get(r.subTeamName) ?? { n: 0, att: 0, pun: 0 };
      g.n += 1; g.att += r.attendanceRate; g.pun += r.punctualityRate;
      groups.set(r.subTeamName, g);
    }
    return [...groups.entries()]
      .map(([name, g]) => ({ name, count: g.n, attendance: g.att / g.n, punctuality: g.pun / g.n }))
      .sort((a, b) => b.attendance - a.attendance);
  }, [leaders]);

  const live = useMemo(() => {
    const checkedIn = liveRecords.filter((r) => r.status !== 'ABSENT').length;
    const onTime = liveRecords.filter((r) => ['EARLY', 'ON_TIME'].includes(r.status)).length;
    const graceLate = liveRecords.filter((r) => ['GRACE_PERIOD', 'LATE'].includes(r.status)).length;
    const roster = stats?.totalActiveMembers ?? 0;
    return { checkedIn, onTime, graceLate, roster, expected: Math.max(0, roster - checkedIn), pct: roster ? Math.round((checkedIn / roster) * 100) : 0 };
  }, [liveRecords, stats]);

  const queue = [
    ...excuses.map((e) => ({ id: e.id, kind: 'Absence', who: `${e.member.firstName} ${e.member.lastName}`, detail: `${e.reason?.slice(0, 48) || 'No reason given'} · ${e.member.subTeam?.name ?? 'Unassigned'}`, href: '/admin/absence-requests', cta: 'Review' })),
    ...corrections.map((c) => ({ id: c.id, kind: 'Correction', who: `${c.member.firstName} ${c.member.lastName}`, detail: c.reason?.slice(0, 60) || 'Attendance correction', href: '/admin/absence-requests', cta: 'Verify' })),
  ];

  const exportHref = `${API_BASE_URL}/reports/export/excel`;
  const doExport = async () => {
    const res = await fetch(exportHref, { headers: { Authorization: `Bearer ${getAuthToken() ?? ''}` } });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'tfhc-orderliness-report.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background pb-16 text-on-background">
      <Navbar />
      <main className="mx-auto max-w-6xl space-y-5 px-4 pt-5 sm:px-6">
        {/* Identity strip */}
        <div className="flex flex-col gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
              {user?.firstName ? `Welcome, ${user.firstName}` : 'TFHC Orderliness'}
            </p>
            <h1 className="text-xl font-extrabold text-on-surface">Unit leadership overview</h1>
            <p className="text-xs text-on-surface-variant">Attendance &amp; participation control centre · last 30 days</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/meetings" className="rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-on-primary hover:bg-primary/90">+ Create meeting</Link>
            <button onClick={doExport} className="rounded-xl border border-outline-variant/40 bg-surface-container px-3.5 py-2 text-xs font-bold text-on-surface hover:bg-surface-container-high">Export Excel</button>
          </div>
        </div>

        {/* Live session control */}
        <section className="rounded-2xl bg-[#0f172a] p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-white/70">
              <span className={`h-2 w-2 rounded-full ${active ? 'bg-emerald-400' : 'bg-white/40'}`} />
              Live session control
            </span>
            {active?.attendanceCloseTime && (
              <span className="text-xs text-white/60">Closes {new Date(active.attendanceCloseTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </div>
          {active ? (
            <>
              <p className="mt-2 text-lg font-bold">{active.title}</p>
              <p className="text-xs text-white/60">{active.locationName}{active.geofenceRadiusMeters ? ` · geofence ${active.geofenceRadiusMeters}m` : ''}</p>
              <div className="mt-4 flex items-end justify-between">
                <p className="text-3xl font-extrabold">{live.checkedIn}<span className="text-lg font-semibold text-white/50"> / {live.roster || '—'}</span></p>
                <p className="text-sm font-bold text-emerald-400">{live.pct}%</p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${live.pct}%` }} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[['On-time', live.onTime], ['Grace / late', live.graceLate], ['Not in yet', live.expected]].map(([l, v]) => (
                  <div key={l as string} className="rounded-xl bg-white/5 py-2">
                    <p className="text-lg font-bold">{v as number}</p>
                    <p className="text-[11px] text-white/50">{l as string}</p>
                  </div>
                ))}
              </div>
              <Link href={`/admin/live-meeting/${active.id}`} className="mt-4 block rounded-xl bg-emerald-500 py-2.5 text-center text-xs font-bold uppercase tracking-wide text-slate-950 hover:bg-emerald-400">
                Open live attendance monitor
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-white/70">No session is live right now.</p>
              <Link href="/admin/meetings" className="mt-3 inline-block rounded-xl bg-white/10 px-4 py-2 text-xs font-bold hover:bg-white/20">Schedule the next gathering</Link>
            </>
          )}
        </section>

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Active roster" value={`${stats?.totalActiveMembers ?? '—'}`} sub={`${stats?.meetingsHeld ?? 0} meetings held`} />
          <StatTile label="Avg attendance" value={pct(stats?.avgAttendance)} sub="30-day benchmark" tone={(stats?.avgAttendance ?? 0) >= 90 ? 'good' : (stats?.avgAttendance ?? 0) >= 75 ? 'warn' : 'bad'} />
          <StatTile label="Punctuality" value={pct(stats?.avgPunctuality)} sub="of those present, on time" tone={(stats?.avgPunctuality ?? 0) >= 80 ? 'good' : 'warn'} />
          <StatTile label="Pending excuses" value={`${stats?.pendingExcusesCount ?? 0}`} sub={`${stats?.activeFlagsCount ?? 0} follow-up flags`} tone={(stats?.pendingExcusesCount ?? 0) > 0 ? 'warn' : 'default'} />
        </div>

        {/* Action queue */}
        <Card title={`Action queue${queue.length ? ` · ${queue.length} pending` : ''}`} action={<Link href="/admin/absence-requests" className="text-xs font-semibold text-primary hover:underline">Open queue</Link>}>
          {loading ? (
            <p className="py-6 text-center text-sm text-on-surface-variant">Loading…</p>
          ) : queue.length === 0 ? (
            <p className="py-6 text-center text-sm text-on-surface-variant">Nothing waiting for review. 🎉</p>
          ) : (
            <ul className="divide-y divide-outline-variant/20">
              {queue.slice(0, 6).map((q) => (
                <li key={q.id} className="flex items-center gap-3 py-2.5">
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${q.kind === 'Absence' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>{q.kind}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-on-surface">{q.who}</p>
                    <p className="truncate text-xs text-on-surface-variant">{q.detail}</p>
                  </div>
                  <Link href={q.href} className="shrink-0 rounded-lg border border-outline-variant/40 px-3 py-1 text-xs font-semibold text-on-surface hover:bg-surface-container">{q.cta}</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Weekly trajectory */}
          <Card title="Service attendance trajectory" action={<span className="text-xs text-on-surface-variant">last {trajectory.length} services</span>}>
            {trajectory.length >= 2 ? (
              <>
                <Sparkline points={trajectory} />
                <div className="mt-2 flex justify-between text-xs text-on-surface-variant">
                  <span>Low {pct(Math.min(...trajectory))}</span>
                  <span>Now {pct(trajectory[trajectory.length - 1])}</span>
                  <span>Peak {pct(Math.max(...trajectory))}</span>
                </div>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-on-surface-variant">Not enough closed services yet.</p>
            )}
          </Card>

          {/* Punctuality ratio */}
          <Card title="Punctuality this period">
            <div className="flex h-4 overflow-hidden rounded-full">
              <div className="bg-emerald-500" style={{ width: `${punctuality.pOn}%` }} title={`On time ${punctuality.pOn.toFixed(0)}%`} />
              <div className="bg-amber-400" style={{ width: `${punctuality.pGrace}%` }} title={`Grace / late ${punctuality.pGrace.toFixed(0)}%`} />
              <div className="bg-rose-400" style={{ width: `${punctuality.pAbsent}%` }} title={`Absent ${punctuality.pAbsent.toFixed(0)}%`} />
            </div>
            <div className="mt-3 space-y-1 text-xs">
              <p className="flex justify-between"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />On time</span><span className="font-semibold">{punctuality.onTime} · {punctuality.pOn.toFixed(1)}%</span></p>
              <p className="flex justify-between"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Grace / late</span><span className="font-semibold">{punctuality.grace} · {punctuality.pGrace.toFixed(1)}%</span></p>
              <p className="flex justify-between"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-400" />Absent</span><span className="font-semibold">{punctuality.absent} · {punctuality.pAbsent.toFixed(1)}%</span></p>
            </div>
          </Card>
        </div>

        {/* Sub-team compliance */}
        <Card title="Sub-team compliance" action={<Link href="/admin/leaderboard" className="text-xs font-semibold text-primary hover:underline">Leaderboard</Link>}>
          {subTeams.length === 0 ? (
            <p className="py-6 text-center text-sm text-on-surface-variant">No sub-team data yet.</p>
          ) : (
            <ul className="space-y-2">
              {subTeams.slice(0, 6).map((t, i) => {
                const tier = t.attendance >= 90 ? { label: 'Top tier', cls: 'bg-emerald-100 text-emerald-700' } : t.attendance >= 80 ? { label: 'Solid', cls: 'bg-sky-100 text-sky-700' } : t.attendance >= 70 ? { label: 'Watch', cls: 'bg-amber-100 text-amber-700' } : { label: 'Action needed', cls: 'bg-rose-100 text-rose-700' };
                return (
                  <li key={t.name} className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-container text-xs font-bold text-on-surface-variant">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-on-surface">{t.name}</p>
                      <p className="text-xs text-on-surface-variant">{t.count} members · {pct(t.punctuality)} punctual</p>
                    </div>
                    <span className="text-sm font-bold text-on-surface">{pct(t.attendance)}</span>
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${tier.cls}`}>{tier.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* At-risk follow-up */}
        <Card title={`At-risk follow-up${flags.length ? ` · ${flags.length}` : ''}`} action={<Link href="/admin/follow-up" className="text-xs font-semibold text-primary hover:underline">All flags</Link>}>
          {flags.length === 0 ? (
            <p className="py-6 text-center text-sm text-on-surface-variant">No members currently flagged.</p>
          ) : (
            <ul className="divide-y divide-outline-variant/20">
              {flags.slice(0, 5).map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-2.5">
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${f.flagLevel >= 3 ? 'bg-rose-100 text-rose-700' : f.flagLevel === 2 ? 'bg-amber-100 text-amber-700' : 'bg-yellow-100 text-yellow-700'}`}>L{f.flagLevel}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-on-surface">{f.member.firstName} {f.member.lastName}</p>
                    <p className="truncate text-xs text-on-surface-variant">{f.flagReason} · {f.member.subTeam?.name ?? 'Unassigned'}</p>
                  </div>
                  {f.member.phoneNumber && (
                    <a href={`tel:${f.member.phoneNumber}`} className="shrink-0 rounded-lg border border-outline-variant/40 px-3 py-1 text-xs font-semibold text-on-surface hover:bg-surface-container">Call</a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Admin tools */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { href: '/admin/meetings', icon: 'event', label: 'Meetings', sub: 'Schedule & geofence' },
            { href: '/admin/chat', icon: 'campaign', label: 'Send notice', sub: 'In-app messaging' },
            { href: '/admin/administration/team', icon: 'groups', label: 'Roster & teams', sub: 'Members & roles' },
            { href: '/admin/reports', icon: 'download', label: 'Reports', sub: 'CSV & Excel export' },
          ].map((t) => (
            <Link key={t.href} href={t.href} className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm transition-colors hover:border-primary/40">
              <span className="material-symbols-outlined text-primary">{t.icon}</span>
              <p className="mt-2 text-sm font-bold text-on-surface">{t.label}</p>
              <p className="text-xs text-on-surface-variant">{t.sub}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
