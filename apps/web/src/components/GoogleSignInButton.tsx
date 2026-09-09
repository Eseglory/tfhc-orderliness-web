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
  const rawClientId = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  // A REPLACE_-prefixed value is an unfilled placeholder (mirrors how the API
  // treats GOOGLE_OAUTH_CLIENT_IDS) — treat it as unset rather than handing a
  // bogus client_id to Google Identity Services.
  const clientId = rawClientId && !rawClientId.startsWith('REPLACE_') ? rawClientId : undefined;
  const buttonRef = useRef<HTMLDivElement>(null);
  // The GIS callback is registered once, but must always invoke the latest
  // onCredential — binding it to the first render's closure would capture a
  // stale "Remember Me" value on the login page.
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;

  const initialize = () => {
    if (!clientId || !window.google || !buttonRef.current) return;
    // Idempotent: React StrictMode double-invokes effects in development,
    // and onLoad can also fire after the mount-time check already ran.
    buttonRef.current.innerHTML = '';
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => onCredentialRef.current(response.credential),
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
