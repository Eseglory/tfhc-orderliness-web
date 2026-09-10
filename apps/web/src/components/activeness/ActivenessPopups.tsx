'use client';
import React from 'react';
import { IdleTimeoutModal } from './IdleTimeoutModal';

/**
 * The idle-timeout modal runs on every signed-in shell (member + admin). The
 * member engagement / profile-completion nudges live in the member dashboard
 * page itself (as in-flow cards) so they never overlap another page's controls.
 */
export function ActivenessPopups() {
  return <IdleTimeoutModal />;
}
