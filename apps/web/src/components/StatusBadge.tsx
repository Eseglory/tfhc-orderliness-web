import React from 'react';

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  let bgColor = 'bg-slate-700 text-slate-300';

  switch (status) {
    case 'EARLY':
      bgColor = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
      break;
    case 'ON_TIME':
      bgColor = 'bg-green-500/20 text-green-400 border border-green-500/30';
      break;
    case 'GRACE_PERIOD':
      bgColor = 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
      break;
    case 'LATE':
      bgColor = 'bg-orange-500/20 text-orange-400 border border-orange-500/30';
      break;
    case 'ABSENT':
      bgColor = 'bg-rose-500/20 text-rose-400 border border-rose-500/30';
      break;
    case 'EXCUSED':
      bgColor = 'bg-sky-500/20 text-sky-400 border border-sky-500/30';
      break;
    case 'EXEMPT':
      bgColor = 'bg-purple-500/20 text-purple-400 border border-purple-500/30';
      break;
  }

  return (
    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${bgColor}`}>
      {status.replace('_', ' ')}
    </span>
  );
};
