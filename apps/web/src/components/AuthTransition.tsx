'use client';
import { LoadingScreen } from './LoadingScreen';

export function AuthTransition({ action }: { action: 'in' | 'out' }) {
  return (
    <LoadingScreen
      message={action === 'in' ? 'Signing you in securely…' : 'Signing you out…'}
      subtext={action === 'in' ? 'Welcome to Orderliness' : 'See you at the next service'}
    />
  );
}
