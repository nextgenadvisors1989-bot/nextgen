import type { Metadata } from 'next';
import { requirePanel, hasPermission } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { ContactEnquiriesTable } from '@/components/cms/contact-enquiries';

export const metadata: Metadata = { title: 'Contact Enquiries' };
export const dynamic = 'force-dynamic';

export default async function ContactEnquiriesPage() {
  const user = await requirePanel(['admin', 'super_admin']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contact Enquiries"
        description="Messages sent from the public Contact page. Work each one through New, In Progress and Responded, and keep the response on record."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Contact Enquiries' }]}
      />
      {hasPermission(user.permissions, 'contact_enquiry.read') ? (
        <ContactEnquiriesTable />
      ) : (
        <p className="rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm text-ink-soft">
          Your role does not include <span className="font-medium">contact_enquiry.read</span>. Ask an administrator to grant it from
          Roles &amp; Permissions.
        </p>
      )}
    </div>
  );
}
