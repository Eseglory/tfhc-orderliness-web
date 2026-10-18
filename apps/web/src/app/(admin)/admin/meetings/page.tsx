'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingScreen } from '../../../../components/LoadingScreen';

export default function MeetingsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/events');
  }, [router]);

  return (
    <LoadingScreen
      message="Redirecting to Events Calendar…"
      subtext="The Father's House Church"
      secondaryMessage="Loading church schedule & operational views"
    />
  );
}
