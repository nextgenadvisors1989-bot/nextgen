import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { getDocumentDetail } from '@/services/compliance.service';
import { DocumentDetail } from '@/components/compliance/document-detail';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ documentId: string }> }): Promise<Metadata> {
  const { documentId } = await params;
  try {
    const data = await getDocumentDetail(Number(documentId));
    return { title: data.document.document_name };
  } catch {
    return { title: 'Compliance Document' };
  }
}

export default async function DocumentDetailPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const id = Number(documentId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await requirePageUser();
  let data;
  try {
    data = await getDocumentDetail(id);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') notFound();
    throw error;
  }

  return (
    <DocumentDetail
      document={JSON.parse(JSON.stringify(data.document))}
      canUpdate={hasPermission(user.permissions, 'compliance_document.update')}
      canDelete={hasPermission(user.permissions, 'compliance_document.delete')}
      canVerify={hasPermission(user.permissions, 'compliance_document.verify')}
      canRemind={hasPermission(user.permissions, 'compliance_document.read')}
    />
  );
}
