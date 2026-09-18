'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingScreen } from '../../../../components/LoadingScreen';

export default function MeetingsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/events');
  }, [router]);

  return <LoadingScreen message="Redirecting to Unified Events & Services Hub…" />;
}
