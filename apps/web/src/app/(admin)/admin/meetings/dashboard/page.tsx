'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingScreen } from '../../../../../components/LoadingScreen';

export default function MeetingsDashboardRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/events?view=operations');
  }, [router]);

  return <LoadingScreen message="Loading application…" />;
}
