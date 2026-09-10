'use client';
import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navbar } from '../../../../components/Navbar';
import { ChatWorkspace } from '../../../../components/chat/ChatWorkspace';

function AdminChat() {
  const room = useSearchParams().get('room');
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <ChatWorkspace deepLinkRoomId={room} />
    </main>
  );
}

export default function AdminChatPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-on-surface-variant">Loading chat…</p>}>
      <AdminChat />
    </Suspense>
  );
}
