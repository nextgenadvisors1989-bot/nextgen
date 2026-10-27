import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { getPageDetail, pageOptions, slugCatalog } from '@/services/cms.service';
import { PageEditor, type PageDetail, type SectionRow } from '@/components/cms/page-editor';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ pageId: string }> }): Promise<Metadata> {
  const { pageId } = await params;
  try {
    const detail = await getPageDetail(Number(pageId));
    return { title: `Edit — ${String(detail.page.title)}` };
  } catch {
    return { title: 'Page' };
  }
}

export default async function EditCmsPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const id = Number(pageId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await requirePageUser();

  let detail: Awaited<ReturnType<typeof getPageDetail>>;
  try {
    detail = await getPageDetail(id);
  } catch {
    notFound();
  }

  const [catalog, pages] = await Promise.all([slugCatalog(id), pageOptions(id)]);

  // Rows arrive as driver packets; carry them across the boundary as plain objects.
  const editorDetail: PageDetail = {
    page: JSON.parse(JSON.stringify(detail.page)) as Record<string, unknown>,
    sections: (detail.sections as unknown as SectionRow[]).map((row) => JSON.parse(JSON.stringify(row)) as SectionRow),
    children: (detail.children as unknown as { id: number; title: string; slug: string; status: string }[]).map((row) => ({
      id: Number(row.id),
      title: String(row.title),
      slug: String(row.slug),
      status: String(row.status),
    })),
    parent: detail.parent
      ? { id: Number(detail.parent.id), title: String(detail.parent.title), slug: String(detail.parent.slug) }
      : null,
  };

  return (
    <div className="space-y-5">
      <nav className="text-sm text-ink-muted">
        <Link href="/admin/cms/pages" className="text-brand-600 hover:underline">Pages</Link>
        <span className="mx-2">/</span>
        <Link href={`/admin/cms/pages/${id}`} className="text-brand-600 hover:underline">{String(detail.page.title)}</Link>
        <span className="mx-2">/</span>
        <span className="text-ink-soft">Edit</span>
      </nav>
      <header>
        <h1 className="text-xl font-semibold text-ink">{String(detail.page.title)}</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          The body, the blocks beneath it, the menu placement and the metadata. Nothing reaches the public site until
          the page is published, and every change is written to the activity log with its before and after values.
        </p>
      </header>
      <PageEditor
        mode="edit"
        pageId={id}
        detail={editorDetail}
        catalog={catalog}
        pageOptions={pages}
        canEdit={hasPermission(user.permissions, 'cms_page.update')}
        canDelete={hasPermission(user.permissions, 'cms_page.delete')}
      />
    </div>
  );
}
