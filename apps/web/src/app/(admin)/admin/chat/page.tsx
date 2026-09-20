'use client';
import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { ChatWorkspace } from '../../../../components/chat/ChatWorkspace';

function AdminChatContent() {
  const searchParams = useSearchParams();
  const room = searchParams.get('room') || searchParams.get('roomId');

  return (
    <div className="h-[calc(100vh-12rem)] min-h-[550px] rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden shadow-sm flex flex-col">
      <ChatWorkspace deepLinkRoomId={room} />
    </div>
  );
}

export default function AdminCommunicationsChatPage() {
  return (
    <AdminLayoutShell activeHref="/admin/chat">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-on-surface">Messages &amp; Announcements</h1>
          <p className="mt-1 text-xs text-on-surface-variant">
            Real-time unit communication, executive channels, broadcast announcements, and direct messaging.
          </p>
        </div>

        <Suspense fallback={<div className="p-8 text-center text-sm text-on-surface-variant">Loading messages…</div>}>
          <AdminChatContent />
        </Suspense>
      </div>
    </AdminLayoutShell>
  );
}
