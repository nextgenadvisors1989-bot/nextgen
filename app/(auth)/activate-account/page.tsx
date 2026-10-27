import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ActivateAccountForm } from './activate-account-form';
import { Spinner } from '@/components/ui/loader';

export const metadata: Metadata = { title: 'Activate Account' };

export default function ActivateAccountPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Spinner size={32} /></div>}>
      <ActivateAccountForm />
    </Suspense>
  );
}
