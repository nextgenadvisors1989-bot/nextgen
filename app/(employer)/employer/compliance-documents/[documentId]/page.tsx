import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { getEmployerDocumentDetail } from '@/services/compliance.service';
import { DocumentDetail } from '@/components/compliance/document-detail';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ documentId: string }> }): Promise<Metadata> {
  const { documentId } = await params;
  try {
    return { title: 'Compliance Document' };
  } catch {
    return { title: 'Compliance Document' };
  }
}

export default async function EmployerDocumentDetailPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const id = Number(documentId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await requirePageUser();
  let data;
  try {
    data = await getEmployerDocumentDetail(Number(user.employerId ?? 0), id);
  } catch (error) {
    if (['NOT_FOUND', 'FORBIDDEN'].includes(String((error as { code?: string }).code))) notFound();
    throw error;
  }

  return (
    <DocumentDetail
      document={JSON.parse(JSON.stringify(data.document))}
      base="/api/employer/compliance-documents"
      employerView
      canUpdate={hasPermission(user.permissions, 'compliance_document.update')}
      canDelete={hasPermission(user.permissions, 'compliance_document.delete')}
      canVerify={false}
      canRemind={false}
    />
  );
}
