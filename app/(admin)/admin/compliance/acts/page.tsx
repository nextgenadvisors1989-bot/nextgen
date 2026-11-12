import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { hasPermission } from '@/lib/auth/rbac';
import { ActsTable } from '@/components/compliance/acts-table';

export const metadata: Metadata = { title: 'Acts & Rules' };
export const dynamic = 'force-dynamic';

export default async function ComplianceActsPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Acts &amp; Rules</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The Acts and Rules the platform audits against, Central and state. Open one and use its <em>Chapters &amp; sections</em> tab to write or read the full text (chapters, sections,
          sub sections, amendments); its other tabs hold the obligations, regulations and Gazette notifications under it. Acts marked for the public website are published on the
          public Acts &amp; Compliance page, and every Act with a text is in the auditors&apos; Acts library.
        </p>
      </header>
      <ActsTable
        canCreate={hasPermission(user.permissions, 'compliance_act.create')}
        canUpdate={hasPermission(user.permissions, 'compliance_act.update')}
        canDelete={hasPermission(user.permissions, 'compliance_act.delete')}
      />
    </div>
  );
}
