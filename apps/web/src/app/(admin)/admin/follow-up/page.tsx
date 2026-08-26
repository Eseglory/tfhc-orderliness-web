'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '../../../../components/Navbar';
import { fetchApi } from '../../../../lib/api';
import { ShieldAlert, CheckCircle2, RefreshCw, AlertTriangle } from 'lucide-react';

export default function AdminFollowUpPage() {
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const [selectedFlagId, setSelectedFlagId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolving, setResolving] = useState(false);

  const loadFlags = async () => {
    setLoading(true);
    try {
      const data = await fetchApi('/alerts');
      setFlags(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFlags();
  }, []);

  const handleScanFlags = async () => {
    setScanning(true);
    try {
      await fetchApi('/alerts/evaluate', { method: 'POST' });
      await loadFlags();
    } catch (err: any) {
      alert(err.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const handleResolveFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFlagId) return;

    setResolving(true);
    try {
      await fetchApi(`/alerts/${selectedFlagId}/resolve`, {
        method: 'PUT',
        body: JSON.stringify({ notes: resolutionNotes }),
      });

      setSelectedFlagId(null);
      setResolutionNotes('');
      loadFlags();
    } catch (err: any) {
      alert(err.message || 'Failed to resolve flag');
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Follow-Up Threshold Flags</h1>
            <p className="text-xs text-slate-400 mt-1">
              Automated flags for members requiring leadership review & pastoral contact
            </p>
          </div>

          <button
            onClick={handleScanFlags}
            disabled={scanning}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white shadow-lg shadow-indigo-600/20"
          >
            <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} /> Run Threshold Scanner
          </button>
        </div>

        {/* Flags List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {flags.length > 0 ? (
            flags.map((flag) => (
              <div
                key={flag.id}
                className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-xl flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                        flag.flagLevel === 3
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : flag.flagLevel === 2
                          ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      Level {flag.flagLevel} Flag
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(flag.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {flag.member?.firstName} {flag.member?.lastName}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Member ID: {flag.member?.memberCode} | Sub-Team: {flag.member?.subTeam?.name || 'Unassigned'}
                    </p>
                  </div>

                  <p className="text-xs text-slate-300 bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
                    {flag.flagReason}
                  </p>
                </div>

                <button
                  onClick={() => setSelectedFlagId(flag.id)}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold text-xs text-emerald-400 border border-slate-700 transition-colors flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" /> Mark Actioned & Resolve
                </button>
              </div>
            ))
          ) : (
            <div className="col-span-full bg-slate-900 border border-slate-800 p-12 rounded-2xl text-center text-slate-500">
              {loading ? 'Evaluating follow-up flags...' : '🎉 No active follow-up flags recorded! All members meeting participation benchmarks.'}
            </div>
          )}
        </div>

        {/* Resolve Flag Modal */}
        {selectedFlagId && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
              <h2 className="text-lg font-bold text-white">Resolve Follow-Up Flag</h2>

              <form onSubmit={handleResolveFlag} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Pastoral Action Notes</label>
                  <textarea
                    required
                    rows={3}
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Enter notes on phone call, meeting, or pastoral outreach..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedFlagId(null)}
                    className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resolving}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-xs text-slate-950 shadow-lg shadow-emerald-600/20"
                  >
                    {resolving ? 'Resolving...' : 'Confirm Resolution'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
