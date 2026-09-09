'use client';
import { AuthProvider } from '../../lib/auth';
import { ToastProvider } from '../../components/ui';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  );
}
