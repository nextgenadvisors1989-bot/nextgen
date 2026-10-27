import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/breadcrumb';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { CompanyProfile } from '@/components/employer/company-profile';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = { title: 'Correct Company Details' };
export const dynamic = 'force-dynamic';

/**
 * The company profile, opened straight into its correction form.
 *
 * The same component backs `/employer/profile`; this route exists so the
 * "correct your details" flow has an address of its own that can be linked to,
 * bookmarked and returned to after a validation error. Fields the platform owns
 * — the employer code, the status and the portal login — are never in the form,
 * and the API refuses them by name if they are posted.
 */
export default async function EmployerProfileEditPage() {
  const user = await requirePageUser();
  const canUpdate = hasPermission(user.permissions, 'employer.update');

  if (!canUpdate) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Correct Company Details"
          breadcrumbs={[
            { label: 'Dashboard', href: '/employer/dashboard' },
            { label: 'Company Profile', href: '/employer/profile' },
            { label: 'Correct Details' },
          ]}
        />
        <EmptyState
          title="Your login cannot change the company file"
          subtitle="Only the platform's administrator, or an employer user with the update permission, may correct these details."
          action={<Link href="/employer/profile" className="btn btn-primary">Back to the profile</Link>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Correct Company Details"
        description="Your establishment's own file. Save when you are done — the change is written to the activity log."
        breadcrumbs={[
          { label: 'Dashboard', href: '/employer/dashboard' },
          { label: 'Company Profile', href: '/employer/profile' },
          { label: 'Correct Details' },
        ]}
      />
      <CompanyProfile canUpdate startInEdit />
    </div>
  );
}
