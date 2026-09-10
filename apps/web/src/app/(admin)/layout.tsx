'use client';
import { AuthProvider } from '../../lib/auth';
import { ToastProvider } from '../../components/ui';
import { ActivenessPopups } from '../../components/activeness/ActivenessPopups';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <ActivenessPopups />
        {children}
      </ToastProvider>
    </AuthProvider>
  );
}
