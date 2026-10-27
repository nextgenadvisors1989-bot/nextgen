import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { RegulationForm } from '@/components/compliance/regulation-form';

export const metadata: Metadata = { title: 'Add Compliance Instrument' };
export const dynamic = 'force-dynamic';

export default async function CreateRegulationPage() {
  await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Add an Instrument</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Link the instrument to its parent act (and optionally to the obligation it gives effect to).
        </p>
      </header>
      <RegulationForm mode="create" />
    </div>
  );
}
