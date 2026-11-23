'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function MemberAvailabilityRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/member/timetable');
  }, [router]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
      <div className="w-10 h-10 border-4 border-[#0b1c30] dark:border-white border-t-transparent rounded-full animate-spin mb-4" />
      <h2 className="text-lg font-bold text-[#0b1c30] dark:text-white">
        Redirecting to Ushering Timetable…
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
        Weekly availability forms have been superseded by your automated weekly ushering timetable schedule.
      </p>
    </div>
  );
}
