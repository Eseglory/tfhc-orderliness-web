'use client';
import { createPortal } from 'react-dom';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/* -------------------------------------------------------------------------- */
/*  Buttons                                                                    */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:opacity-90 disabled:opacity-50',
  secondary:
    'bg-surface-container text-on-surface border border-outline-variant/40 hover:bg-surface-container-high disabled:opacity-50',
  ghost: 'text-on-surface-variant hover:bg-surface-container disabled:opacity-50',
  danger: 'bg-error text-on-error hover:opacity-90 disabled:opacity-50',
};

export function Button({
  variant = 'primary',
  className = '',
  loading,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${buttonStyles[variant]} ${className}`}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Form fields                                                                */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  error,
  children,
  required,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-on-surface">
        {label}
        {required && <span className="text-error"> *</span>}
      </span>
      {children}
      {hint && !error && <span className="block text-xs text-on-surface-variant">{hint}</span>}
      {error && (
        <span role="alert" className="block text-xs font-medium text-error">
          {error}
        </span>
      )}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

/* -------------------------------------------------------------------------- */
/*  Modal                                                                      */
/* -------------------------------------------------------------------------- */

export function Modal({
  open,
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
}) {
  const isVisible = Boolean(open ?? isOpen);
  const ref = useRef<HTMLDivElement>(null);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isVisible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key !== 'Tab') return;
      const elements = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') || []).filter(el => el.getClientRects().length);
      const first = elements[0], last = elements[elements.length - 1];
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previous?.focus?.();
    };
  }, [isVisible]);

  if (!isVisible || typeof document === 'undefined') return null;
  const widths = { md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-inverse-surface/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92dvh] w-full ${widths[size]} flex-col overflow-hidden rounded-t-2xl bg-surface-container-lowest shadow-xl outline-none sm:rounded-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant/20 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-on-surface">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-on-surface-variant">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-outline-variant/20 bg-surface-container-low/50 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>, document.body
  );
}

/* -------------------------------------------------------------------------- */
/*  Toasts                                                                     */
/* -------------------------------------------------------------------------- */

type Toast = { id: number; message: string; tone: 'success' | 'error' | 'info' };
export type NotifyOptions = string | { title?: string; description?: string; variant?: string; message?: string };
const ToastContext = createContext<{ notify: (messageOrOptions: NotifyOptions, tone?: Toast['tone']) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((messageOrOptions: NotifyOptions, tone: Toast['tone'] = 'info') => {
    let msg = '';
    let finalTone = tone;
    if (typeof messageOrOptions === 'string') {
      msg = messageOrOptions;
    } else if (messageOrOptions) {
      msg = messageOrOptions.description || messageOrOptions.message || messageOrOptions.title || '';
      if (messageOrOptions.variant === 'destructive' || messageOrOptions.variant === 'error') finalTone = 'error';
      else if (messageOrOptions.variant === 'success') finalTone = 'success';
    }
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message: msg, tone: finalTone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[200] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto w-full max-w-sm rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              t.tone === 'success'
                ? 'bg-tertiary-container text-on-tertiary-container'
                : t.tone === 'error'
                  ? 'bg-error-container text-on-error-container'
                  : 'bg-inverse-surface text-inverse-on-surface'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return { notify: (_m: NotifyOptions, _t?: Toast['tone']) => undefined };
  return ctx;
}

/* -------------------------------------------------------------------------- */
/*  Page scaffolding                                                           */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-on-surface-variant">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/40 px-6 py-12 text-center">
      <h3 className="text-base font-semibold text-on-surface">{title}</h3>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-on-surface-variant">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const tones = {
    neutral: 'bg-surface-container-high text-on-surface-variant',
    success: 'bg-tertiary-container text-on-tertiary-container',
    warning: 'bg-secondary-container/40 text-on-secondary-container',
    danger: 'bg-error-container text-on-error-container',
    info: 'bg-primary-fixed text-on-primary-fixed',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function ConfirmDialog({
  open,
  isOpen,
  title,
  body,
  message,
  confirmLabel = 'Confirm',
  tone,
  confirmVariant,
  onConfirm,
  onCancel,
  onClose,
  loading,
}: {
  open?: boolean;
  isOpen?: boolean;
  title: string;
  body?: string;
  message?: string;
  confirmLabel?: string;
  tone?: ButtonVariant;
  confirmVariant?: 'primary' | 'danger' | 'secondary';
  onConfirm: () => void;
  onCancel?: () => void;
  onClose?: () => void;
  loading?: boolean;
}) {
  const isVisible = Boolean(open ?? isOpen);
  const handleClose = onCancel || onClose || (() => {});
  const finalTone = (tone || confirmVariant || 'danger') as ButtonVariant;
  const content = body || message || '';

  return (
    <Modal
      open={isVisible}
      onClose={handleClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant={finalTone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-on-surface-variant">{content}</p>
    </Modal>
  );
}
