import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth/auth';
import { ChangePasswordForm } from './change-password-form';
import { ToastProvider } from '@/components/ui/toast';

export const metadata: Metadata = { title: 'Change Password' };

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/api/auth/expired');

  return (
    <ToastProvider>
      <div className="card card-pad animate-fade-up">
        <h1 className="text-xl font-bold text-ink">
          {user.isFirstLogin ? 'Activate your account' : 'Change your password'}
        </h1>
        <p className="mt-1.5 mb-5 text-sm text-ink-muted">
          Passwords must be at least 8 characters and include upper case, lower case, a number and a special character.
        </p>
        <ChangePasswordForm isFirstLogin={user.isFirstLogin} userName={user.firstName} />
      </div>
    </ToastProvider>
  );
}
