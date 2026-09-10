'use client';
import React from 'react';
import { LogoIcon } from './LogoIcon';

/**
 * Shared chrome for the unauthenticated auth screens (login, register, verify,
 * forgot / reset password). Mirrors the card styling of /login.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col items-center justify-center p-edge-margin font-body-md antialiased">
      <main className="w-full max-w-md bg-surface-container-lowest rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] p-stack-lg border border-outline-variant/30 flex flex-col gap-stack-lg relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary" />
        <header className="flex flex-col items-center text-center gap-stack-sm pt-stack-sm">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mb-2 shadow-sm border border-outline-variant/20 text-primary relative p-2">
            <LogoIcon alt="TFHC Logo" className="w-full h-full object-contain" />
            <div className="absolute bottom-0 right-0 w-4 h-4 bg-secondary rounded-full border-2 border-surface-container-lowest" />
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">{title}</h1>
          {subtitle && <p className="font-body-md text-body-md text-on-surface-variant">{subtitle}</p>}
        </header>
        {children}
      </main>
      {footer && <footer className="mt-stack-lg text-center text-sm text-on-surface-variant">{footer}</footer>}
    </div>
  );
}

export const authInputClass =
  'w-full bg-surface h-12 px-4 rounded-lg border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary transition-colors text-on-surface font-body-md placeholder-outline-variant';

export function AuthError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="p-3 rounded-lg bg-error-container text-on-error-container font-body-md text-sm border border-error/20 text-center">
      {children}
    </div>
  );
}

export function AuthNotice({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="p-3 rounded-lg bg-secondary/10 text-on-surface font-body-md text-sm border border-secondary/20 text-center">
      {children}
    </div>
  );
}

export function AuthSubmit({ loading, children }: { loading?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full h-12 bg-primary text-on-primary font-label-md text-label-md rounded-lg hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
    >
      {children}
    </button>
  );
}
