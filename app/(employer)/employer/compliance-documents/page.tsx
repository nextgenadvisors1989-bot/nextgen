import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { EmployerDocumentsTable } from '@/components/compliance/employer-documents-table';

export const metadata: Metadata = { title: 'Compliance Documents' };
export const dynamic = 'force-dynamic';

export default async function EmployerComplianceDocumentsPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Compliance Documents</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Your licences, registrations, permits and returns. Keep the dates current — the platform emails you
          before each document lapses and shows the expired ones at the top.
        </p>
      </header>
      <EmployerDocumentsTable
        canCreate={hasPermission(user.permissions, 'compliance_document.create')}
        canUpdate={hasPermission(user.permissions, 'compliance_document.update')}
      />
    </div>
  );
}
