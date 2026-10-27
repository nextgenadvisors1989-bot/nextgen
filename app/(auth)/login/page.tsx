import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from './login-form';
import { Spinner } from '@/components/ui/loader';

export const metadata: Metadata = { title: 'Sign In' };

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Spinner size={32} /></div>}>
      <LoginForm />
    </Suspense>
  );
}
