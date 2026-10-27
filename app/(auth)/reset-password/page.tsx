import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ResetPasswordForm } from './reset-password-form';
import { Spinner } from '@/components/ui/loader';

export const metadata: Metadata = { title: 'Reset Password' };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Spinner size={32} /></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
