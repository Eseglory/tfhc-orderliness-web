'use client';

import React, { useEffect, useState } from 'react';
import { fetchApi, ApiError } from '../../../../lib/api';
import { LogoIcon } from '../../../../components/LogoIcon';

type ReconciliationMember = {
  memberId: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  subTeamName: string;
  actualStatus?: string;
  arrivalTime?: string | null;
};

type ServiceReconciliation = {
  meetingId: string;
  title: string;
  startTime: string;
  endTime: string | null;
  locationName: string | null;
  totalExpectedAvailable: number;
  totalNotAvailable?: number;
  totalNoResponse?: number;
  totalActualAttended: number;
  conversionRate: number;
  categories: {
    availableAndAttended: ReconciliationMember[];
    availableAndAbsent: ReconciliationMember[];
    notAvailable?: ReconciliationMember[];
    noResponse?: ReconciliationMember[];
    uncommittedAndAttended: ReconciliationMember[];
    uncommittedAndAbsent: ReconciliationMember[];
  };
};

type ReconciliationReport = {
  cycle: {
    id: string;
    weekStart: string;
    state: string;
    opensAt: string;
    closesAt: string;
    isRecovery?: boolean;
  };
  services: ServiceReconciliation[];
};

export default function AdminAvailabilityPlanningPage() {
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<
    'availableAndAttended' | 'availableAndAbsent' | 'notAvailable' | 'noResponse' | 'uncommittedAndAttended' | 'uncommittedAndAbsent'
  >('availableAndAttended');
  const [search, setSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchApi<ReconciliationReport>('/availability/admin/reconciliation');
      setReport(data);
      if (data.services.length > 0 && !selectedMeetingId) {
        setSelectedMeetingId(data.services[0].meetingId);
      }
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load availability reconciliation data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeService = report?.services.find((s) => s.meetingId === selectedMeetingId) || report?.services[0];

  const filteredMembers = (activeService?.categories[activeTab] || []).filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      m.firstName.toLowerCase().includes(q) ||
      m.lastName.toLowerCase().includes(q) ||
      m.memberCode.toLowerCase().includes(q) ||
      m.subTeamName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="bg-background text-on-background min-h-screen p-6 max-w-7xl mx-auto pb-24 font-body-md">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-outline-variant/10 pb-6 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-container flex-shrink-0 p-1">
            <LogoIcon alt="Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="font-headline-md text-2xl md:text-3xl font-bold text-primary">
              Weekly Availability & Attendance Reconciliation
            </h1>
            <p className="text-on-surface-variant text-sm mt-0.5">
              Compare planned member availability against authoritative attendance records.
            </p>
          </div>
        </div>

        {report?.cycle && (
          <div className="flex items-center gap-3 bg-surface-container-low px-4 py-2 rounded-xl border border-outline-variant/20 text-sm">
            <span className="material-symbols-outlined text-primary text-lg">calendar_today</span>
            <div>
              <span className="text-on-surface-variant">Week of: </span>
              <span className="font-semibold text-on-surface">
                {new Date(report.cycle.weekStart).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${report.cycle.state === 'OPEN' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-surface-variant text-on-surface-variant'}`}>
              {report.cycle.state}
            </span>
          </div>
        )}
      </header>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 gap-3 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
          <p>Loading planning & reconciliation data…</p>
        </div>
      ) : error ? (
        <div className="bg-error/10 border border-error/20 p-6 rounded-2xl text-center max-w-lg mx-auto">
          <p className="text-error font-medium">{error}</p>
          <button onClick={loadData} className="mt-4 px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-bold">
            Retry
          </button>
        </div>
      ) : !report || report.services.length === 0 ? (
        <div className="text-center py-24 text-on-surface-variant">
          <span className="material-symbols-outlined text-5xl text-outline-variant">event_busy</span>
          <p className="mt-3 font-semibold text-lg">No services found for the current cycle.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Service Selector Tabs */}
          <div className="flex gap-3 overflow-x-auto pb-2 border-b border-outline-variant/10">
            {report.services.map((s) => {
              const isSelected = (activeService?.meetingId === s.meetingId);
              return (
                <button
                  key={s.meetingId}
                  onClick={() => {
                    setSelectedMeetingId(s.meetingId);
                    setSearch('');
                  }}
                  className={`px-5 py-3 rounded-xl text-left border transition-all shrink-0 ${
                    isSelected
                      ? 'bg-primary text-on-primary border-primary shadow-sm'
                      : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low border-outline-variant/20'
                  }`}
                >
                  <p className="font-bold text-sm">{s.title}</p>
                  <p className={`text-xs mt-0.5 ${isSelected ? 'text-on-primary/80' : 'text-on-surface-variant'}`}>
                    {new Date(s.startTime).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </button>
              );
            })}
          </div>

          {activeService && (
            <div className="space-y-6">
              {/* Headline Metrics for the Service */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-surface-container-lowest border border-outline-variant/20 p-5 rounded-2xl shadow-sm">
                  <p className="text-xs uppercase tracking-wider font-semibold text-on-surface-variant">Expected Available</p>
                  <p className="text-3xl font-extrabold text-primary mt-1">{activeService.totalExpectedAvailable}</p>
                  <p className="text-xs text-on-surface-variant mt-1">Marked AVAILABLE in poll</p>
                </div>
                <div className="bg-surface-container-lowest border border-outline-variant/20 p-5 rounded-2xl shadow-sm">
                  <p className="text-xs uppercase tracking-wider font-semibold text-on-surface-variant">Not Available</p>
                  <p className="text-3xl font-extrabold text-amber-600 mt-1">{activeService.totalNotAvailable ?? (activeService.categories.notAvailable?.length || 0)}</p>
                  <p className="text-xs text-on-surface-variant mt-1">Responded, excluded service</p>
                </div>
                <div className="bg-surface-container-lowest border border-outline-variant/20 p-5 rounded-2xl shadow-sm">
                  <p className="text-xs uppercase tracking-wider font-semibold text-on-surface-variant">No Response</p>
                  <p className="text-3xl font-extrabold text-slate-500 mt-1">{activeService.totalNoResponse ?? (activeService.categories.noResponse?.length || 0)}</p>
                  <p className="text-xs text-on-surface-variant mt-1">Never filled poll</p>
                </div>
                <div className="bg-surface-container-lowest border border-outline-variant/20 p-5 rounded-2xl shadow-sm">
                  <p className="text-xs uppercase tracking-wider font-semibold text-on-surface-variant">Actual Attended</p>
                  <p className="text-3xl font-extrabold text-emerald-600 mt-1">{activeService.totalActualAttended}</p>
                  <p className="text-xs text-on-surface-variant mt-1">{activeService.conversionRate}% conversion rate</p>
                </div>
              </div>

              {/* 5 Reconciliation Categories Filter Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <button
                  onClick={() => setActiveTab('availableAndAttended')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    activeTab === 'availableAndAttended'
                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-950 ring-2 ring-emerald-500/20'
                      : 'bg-surface-container-lowest border-outline-variant/20 hover:bg-surface-container-low text-on-surface'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-emerald-700">Category 1</span>
                    <span className="text-lg font-bold text-emerald-700">{activeService.categories.availableAndAttended.length}</span>
                  </div>
                  <p className="font-semibold text-sm mt-1">Said Available + Attended</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">Reliable attendances</p>
                </button>

                <button
                  onClick={() => setActiveTab('availableAndAbsent')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    activeTab === 'availableAndAbsent'
                      ? 'bg-amber-500/10 border-amber-500 text-amber-950 ring-2 ring-amber-500/20'
                      : 'bg-surface-container-lowest border-outline-variant/20 hover:bg-surface-container-low text-on-surface'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-amber-700">Category 2</span>
                    <span className="text-lg font-bold text-amber-700">{activeService.categories.availableAndAbsent.length}</span>
                  </div>
                  <p className="font-semibold text-sm mt-1">Said Available + Absent</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">Planned but absent</p>
                </button>

                <button
                  onClick={() => setActiveTab('notAvailable')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    activeTab === 'notAvailable'
                      ? 'bg-orange-500/10 border-orange-500 text-orange-950 ring-2 ring-orange-500/20'
                      : 'bg-surface-container-lowest border-outline-variant/20 hover:bg-surface-container-low text-on-surface'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-orange-700">Category 3</span>
                    <span className="text-lg font-bold text-orange-700">{activeService.categories.notAvailable?.length || 0}</span>
                  </div>
                  <p className="font-semibold text-sm mt-1">Not Available</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">Explicitly excused/excluded</p>
                </button>

                <button
                  onClick={() => setActiveTab('noResponse')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    activeTab === 'noResponse'
                      ? 'bg-slate-500/10 border-slate-500 text-slate-950 ring-2 ring-slate-500/20'
                      : 'bg-surface-container-lowest border-outline-variant/20 hover:bg-surface-container-low text-on-surface'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-slate-600">Category 4</span>
                    <span className="text-lg font-bold text-slate-700">{activeService.categories.noResponse?.length || 0}</span>
                  </div>
                  <p className="font-semibold text-sm mt-1">No Response</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">Unresponsive to poll</p>
                </button>

                <button
                  onClick={() => setActiveTab('uncommittedAndAttended')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    activeTab === 'uncommittedAndAttended'
                      ? 'bg-blue-500/10 border-blue-500 text-blue-950 ring-2 ring-blue-500/20'
                      : 'bg-surface-container-lowest border-outline-variant/20 hover:bg-surface-container-low text-on-surface'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-blue-700">Category 5</span>
                    <span className="text-lg font-bold text-blue-700">{activeService.categories.uncommittedAndAttended.length}</span>
                  </div>
                  <p className="font-semibold text-sm mt-1">Walk-In / Attended</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">Attended without commit</p>
                </button>
              </div>

              {/* Members Table */}
              <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="font-bold text-lg text-primary">
                      {activeTab === 'availableAndAttended' && 'Category 1: Said Available & Actually Attended'}
                      {activeTab === 'availableAndAbsent' && 'Category 2: Said Available & Did NOT Attend'}
                      {activeTab === 'notAvailable' && 'Category 3: Explicitly Marked Not Available for This Service'}
                      {activeTab === 'noResponse' && 'Category 4: No Response to Weekly Poll'}
                      {activeTab === 'uncommittedAndAttended' && 'Category 5: Walk-In (Attended Without Prior Commitment)'}
                      {activeTab === 'uncommittedAndAbsent' && 'All Uncommitted & Absent'}
                    </h2>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      Showing {filteredMembers.length} member{filteredMembers.length === 1 ? '' : 's'}
                    </p>
                  </div>

                  <div className="relative max-w-xs w-full">
                    <span className="material-symbols-outlined absolute left-3 top-2.5 text-outline-variant text-lg">search</span>
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search members or teams…"
                      className="w-full pl-9 pr-4 py-2 bg-surface-container-low border border-outline-variant/30 rounded-xl text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                {filteredMembers.length === 0 ? (
                  <div className="text-center py-12 text-on-surface-variant">
                    <p>No members match this category.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-outline-variant/10 text-on-surface-variant uppercase text-[11px] tracking-wider">
                          <th className="pb-3 font-semibold">Member Code</th>
                          <th className="pb-3 font-semibold">Full Name</th>
                          <th className="pb-3 font-semibold">Sub-Team</th>
                          <th className="pb-3 font-semibold">Attendance Status</th>
                          <th className="pb-3 font-semibold">Arrival Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/10">
                        {filteredMembers.map((m) => (
                          <tr key={m.memberId} className="hover:bg-surface-container-low/50 transition-colors">
                            <td className="py-3.5 font-mono text-xs text-on-surface-variant">{m.memberCode}</td>
                            <td className="py-3.5 font-bold text-on-surface">{m.firstName} {m.lastName}</td>
                            <td className="py-3.5 text-on-surface-variant">{m.subTeamName}</td>
                            <td className="py-3.5">
                              {m.actualStatus ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-700">
                                  {m.actualStatus}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                                  NOT PRESENT
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 text-on-surface-variant text-xs">
                              {m.arrivalTime ? new Date(m.arrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
