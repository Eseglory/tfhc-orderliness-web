'use client';

import React from 'react';
import { TrendingUp, TrendingDown, ArrowUpRight, LucideIcon } from 'lucide-react';

interface AdminKpiCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  change?: {
    value: string;
    positive?: boolean;
    neutral?: boolean;
  };
  context?: string;
  sparkline?: number[];
  tone?: 'indigo' | 'emerald' | 'amber' | 'purple' | 'slate';
  icon?: LucideIcon;
  onClick?: () => void;
}

export const AdminKpiCard: React.FC<AdminKpiCardProps> = ({
  label,
  value,
  subValue,
  change,
  context,
  sparkline,
  tone = 'indigo',
  icon: Icon,
  onClick,
}) => {
  const toneStyles = {
    indigo: {
      bg: 'bg-indigo-50/50 dark:bg-indigo-950/20',
      border: 'border-indigo-100 dark:border-indigo-900/40',
      iconBg: 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400',
      stroke: '#6366f1',
      fill: 'rgba(99, 102, 241, 0.12)',
    },
    emerald: {
      bg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
      border: 'border-emerald-100 dark:border-emerald-900/40',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400',
      stroke: '#10b981',
      fill: 'rgba(16, 185, 129, 0.12)',
    },
    amber: {
      bg: 'bg-amber-50/50 dark:bg-amber-950/20',
      border: 'border-amber-100 dark:border-amber-900/40',
      iconBg: 'bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400',
      stroke: '#f59e0b',
      fill: 'rgba(245, 158, 11, 0.12)',
    },
    purple: {
      bg: 'bg-purple-50/50 dark:bg-purple-950/20',
      border: 'border-purple-100 dark:border-purple-900/40',
      iconBg: 'bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-400',
      stroke: '#a855f7',
      fill: 'rgba(168, 85, 247, 0.12)',
    },
    slate: {
      bg: 'bg-slate-50/50 dark:bg-slate-900/40',
      border: 'border-slate-200/80 dark:border-slate-800',
      iconBg: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
      stroke: '#64748b',
      fill: 'rgba(100, 116, 139, 0.12)',
    },
  }[tone];

  // Render micro sparkline if points provided
  const renderSparkline = () => {
    if (!sparkline || sparkline.length < 2) return null;
    const w = 110;
    const h = 36;
    const pad = 3;
    const min = Math.min(...sparkline);
    const max = Math.max(...sparkline);
    const span = max - min || 1;
    const xs = (i: number) => pad + (i * (w - pad * 2)) / (sparkline.length - 1);
    const ys = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);

    const d = sparkline
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(v).toFixed(1)}`)
      .join(' ');
    const area = `${d} L ${xs(sparkline.length - 1).toFixed(1)} ${h} L ${xs(0).toFixed(1)} ${h} Z`;

    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-24 h-8 shrink-0 overflow-visible" preserveAspectRatio="none">
        <path d={area} fill={toneStyles.fill} />
        <path d={d} fill="none" stroke={toneStyles.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle
          cx={xs(sparkline.length - 1)}
          cy={ys(sparkline[sparkline.length - 1])}
          r="3"
          fill={toneStyles.stroke}
        />
      </svg>
    );
  };

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl p-4 bg-white dark:bg-slate-900 border ${toneStyles.border} shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${
        onClick ? 'cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700' : ''
      }`}
    >
      <div>
        {/* Header row: Label & Icon / Badge */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {label}
          </span>
          {Icon && (
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${toneStyles.iconBg}`}>
              <Icon className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        {/* Value + Sparkline Row */}
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {value}
            </span>
            {subValue && (
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {subValue}
              </span>
            )}
          </div>
          {renderSparkline()}
        </div>
      </div>

      {/* Footer Info / Trend */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs gap-2">
        {change && (
          <span
            className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md text-[11px] ${
              change.neutral
                ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                : change.positive
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
            }`}
          >
            {change.positive && <TrendingUp className="w-3 h-3" />}
            {!change.positive && !change.neutral && <TrendingDown className="w-3 h-3" />}
            {change.value}
          </span>
        )}

        {context && (
          <span className="text-slate-500 dark:text-slate-400 text-[11px] truncate text-right ml-auto">
            {context}
          </span>
        )}
      </div>
    </div>
  );
};
