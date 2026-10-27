import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePanel, hasPermission } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { ContactEnquiryDetail, type EnquiryDetailData } from '@/components/cms/contact-enquiries';
import { getEnquiry } from '@/services/contact-enquiry.service';

export const metadata: Metadata = { title: 'Enquiry' };
export const dynamic = 'force-dynamic';

export default async function ContactEnquiryPage({ params }: { params: Promise<{ enquiryId: string }> }) {
  const { enquiryId } = await params;
  const id = Number(enquiryId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await requirePanel(['admin', 'super_admin']);
  if (!hasPermission(user.permissions, 'contact_enquiry.read')) notFound();
  const enquiry = await getEnquiry(id);
  if (!enquiry) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Enquiry #${id}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Contact Enquiries', href: '/admin/contact-enquiries' },
          { label: `#${id}` },
        ]}
      />
      <ContactEnquiryDetail
        enquiry={JSON.parse(JSON.stringify(enquiry)) as EnquiryDetailData}
        canEdit={hasPermission(user.permissions, 'contact_enquiry.update')}
      />
    </div>
  );
}
