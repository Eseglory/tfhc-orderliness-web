'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';

export default function AdminAvailabilityRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/timetable');
  }, [router]);

  return (
    <AdminLayoutShell>
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
          Redirecting to Ushering Timetable…
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Weekly availability planning has been superseded by the automated weekly ushering timetable.
        </p>
      </div>
    </AdminLayoutShell>
  );
}
