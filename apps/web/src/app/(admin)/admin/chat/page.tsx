'use client';
import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { ChatWorkspace } from '../../../../components/chat/ChatWorkspace';

function AdminChat() {
  const room = useSearchParams().get('room');
  return (
    <AdminLayoutShell activeHref="/admin/chat">
      <div className="h-[calc(100vh-140px)] rounded-2xl border border-outline/10 bg-surface dark:bg-slate-900 shadow-sm overflow-hidden">
        <ChatWorkspace deepLinkRoomId={room} />
      </div>
    </AdminLayoutShell>
  );
}

export default function AdminChatPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-on-surface-variant">Loading chat…</p>}>
      <AdminChat />
    </Suspense>
  );
}

