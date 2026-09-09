'use client';
import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navbar } from '../../../../components/Navbar';
import { AuthProvider } from '../../../../lib/auth';
import { ToastProvider } from '../../../../components/ui';
import { ChatWorkspace } from '../../../../components/chat/ChatWorkspace';

function MemberChat() {
  const room = useSearchParams().get('room');
  return (
    <AuthProvider>
      <ToastProvider>
        <div className="min-h-screen bg-background">
          <Navbar />
          {/* BottomNav (h-20) is fixed over member routes — keep the composer clear of it. */}
          <ChatWorkspace deepLinkRoomId={room} bottomInset="5rem" />
        </div>
      </ToastProvider>
    </AuthProvider>
  );
}

export default function MemberChatPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-on-surface-variant">Loading chat…</p>}>
      <MemberChat />
    </Suspense>
  );
}
