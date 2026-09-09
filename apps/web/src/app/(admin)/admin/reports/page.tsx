'use client';

import { AttendanceAnalytics } from '../../../../components/AttendanceAnalytics';
import React, { useState } from 'react';
import { Navbar } from '../../../../components/Navbar';
import { API_BASE_URL, getAuthToken } from '../../../../lib/api';
import { FileText, Download, Table, Calendar } from 'lucide-react';

export default function AdminReportsPage() {
  const [downloading, setDownloading] = useState(false);

  const handleExportExcel = async () => {
    setDownloading(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/reports/export/excel`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to export Excel report');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TFHC_Attendance_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <div>
            <h1 className="text-2xl font-bold text-white">Reports & Data Export</h1>
            <p className="text-xs text-slate-400 mt-1">
              Generate unit attendance summaries and export raw audit records to Excel
            </p>
          </div>

          <button
            onClick={handleExportExcel}
            disabled={downloading}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-xs text-slate-950 shadow-lg shadow-emerald-600/20 uppercase tracking-wider transition-all"
          >
            <Download className="w-4 h-4" /> {downloading ? 'Generating Excel...' : 'Export Excel (.xlsx)'}
          </button>
        </div>

        <AttendanceAnalytics />

        {/* Report Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-3 shadow-xl">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Table className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Full Attendance Ledger</h3>
            <p className="text-xs text-slate-400">
              Complete transactional attendance records including GPS coordinates, distances, status classifications, and points.
            </p>
            <button
              onClick={handleExportExcel}
              className="text-xs text-indigo-400 font-semibold hover:underline flex items-center gap-1 pt-2"
            >
              Download XLSX Spreadsheet →
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-3 shadow-xl">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Monthly & Quarterly Reports</h3>
            <p className="text-xs text-slate-400">
              Aggregated unit attendance percentages, punctuality rates, and meeting summaries for pastoral leadership reporting.
            </p>
            <button
              onClick={handleExportExcel}
              className="text-xs text-emerald-400 font-semibold hover:underline flex items-center gap-1 pt-2"
            >
              Generate Summary Report →
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-3 shadow-xl">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Audit Trail Log</h3>
            <p className="text-xs text-slate-400">
              Immutable audit history of all manual attendance overrides, status corrections, and excuse approvals.
            </p>
            <button
              onClick={handleExportExcel}
              className="text-xs text-amber-400 font-semibold hover:underline flex items-center gap-1 pt-2"
            >
              Export Audit Trail →
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
