import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { getFileDetail } from '@/services/file.service';
import { FileDetail } from '@/components/files/file-detail';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ fileId: string }> }): Promise<Metadata> {
  const { fileId } = await params;
  try {
    const detail = await getFileDetail(Number(fileId));
    return { title: detail.document.original_name };
  } catch {
    return { title: 'Document' };
  }
}

export default async function FileDetailPage({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const id = Number(fileId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await requirePageUser();

  let detail;
  try {
    detail = await getFileDetail(id);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-5">
      <nav className="text-sm text-ink-muted">
        <Link href="/admin/files" className="text-brand-600 hover:underline">Document Vault</Link>
        <span className="mx-2">/</span>
        <span className="text-ink-soft">{detail.document.original_name}</span>
      </nav>
      <FileDetail
        document={JSON.parse(JSON.stringify(detail.document))}
        current={detail.current}
        versions={JSON.parse(JSON.stringify(detail.versions))}
        downloadCount={detail.downloadCount}
        canEdit={hasPermission(user.permissions, 'file.update')}
        canDelete={hasPermission(user.permissions, 'file.delete')}
      />
    </div>
  );
}
