'use client';

import React from 'react';
import { useAuth } from '../../lib/auth';
import { useChatSocket } from '../../lib/chat';
import { WebRtcCallModal } from './WebRtcCallModal';
import { soundFx } from '../../lib/sound-fx';

export function GlobalCallManager() {
  const { user } = useAuth();

  const socket = useChatSocket({
    onMessage: (m) => {
      // If a message arrives for the user and they are outside /member/chat:
      if (
        typeof window !== 'undefined' &&
        !window.location.pathname.startsWith('/member/chat') &&
        !m.mine &&
        m.sender?.memberId !== user?.memberId
      ) {
        soundFx.playNotification();
      }
    },
  });

  if (!user) return null;

  return (
    <WebRtcCallModal
      socket={socket.socket}
      currentMemberId={user.memberId}
    />
  );
}
