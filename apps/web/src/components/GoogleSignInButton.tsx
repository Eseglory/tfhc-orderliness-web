'use client';

import { useEffect, useRef } from 'react';
import Script from 'next/script';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export function GoogleSignInButton({ onCredential }: { onCredential: (idToken: string) => void }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const buttonRef = useRef<HTMLDivElement>(null);

  const initialize = () => {
    if (!clientId || !window.google || !buttonRef.current) return;
    // Idempotent: React StrictMode double-invokes effects in development,
    // and onLoad can also fire after the mount-time check already ran.
    buttonRef.current.innerHTML = '';
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => onCredential(response.credential),
    });
    window.google.accounts.id.renderButton(buttonRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      width: 320,
      text: 'signin_with',
    });
  };

  useEffect(() => {
    if (window.google) initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!clientId) {
    return (
      <p className="text-center font-label-sm text-label-sm text-on-surface-variant">
        Member Google sign-in is not configured for this deployment.
      </p>
    );
  }

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={initialize} />
      <div ref={buttonRef} className="flex justify-center" data-testid="google-signin-button" />
    </>
  );
}
