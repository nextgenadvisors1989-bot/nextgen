import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { ActForm } from '@/components/compliance/act-form';

export const metadata: Metadata = { title: 'Add Compliance Act' };
export const dynamic = 'force-dynamic';

export default async function CreateActPage() {
  await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Add an Act</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Record the legislation and who it applies to. State acts must name their state; Central acts must not.
        </p>
      </header>
      <ActForm mode="create" />
    </div>
  );
}
