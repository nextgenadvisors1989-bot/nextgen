import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { pageOptions, slugCatalog } from '@/services/cms.service';
import { PageEditor } from '@/components/cms/page-editor';

export const metadata: Metadata = { title: 'New Page' };
export const dynamic = 'force-dynamic';

export default async function CreateCmsPage() {
  const user = await requirePageUser();
  const [catalog, pages] = await Promise.all([slugCatalog(), pageOptions()]);

  return (
    <div className="space-y-5">
      <nav className="text-sm text-ink-muted">
        <Link href="/admin/cms/pages" className="text-brand-600 hover:underline">Pages</Link>
        <span className="mx-2">/</span>
        <span className="text-ink-soft">New page</span>
      </nav>
      <header>
        <h1 className="text-xl font-semibold text-ink">Create a page</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Give the page its title and address first; the blocks that make up the page are added after the first save.
          A slug that another page or resource already uses — or that the platform itself owns, such as /login — is
          refused before anything is written.
        </p>
      </header>
      <PageEditor
        mode="create"
        catalog={catalog}
        pageOptions={pages}
        canEdit={hasPermission(user.permissions, 'cms_page.create')}
        canDelete={false}
      />
    </div>
  );
}
