import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { HomeEditor, type EditorBlock } from '@/components/cms/home-editor';
import { getHomeEditorState } from '@/services/home-editor.service';

export const metadata: Metadata = { title: 'Home page' };
export const dynamic = 'force-dynamic';

export default async function AdminHomePageEditor() {
  const user = await requirePageUser();
  const state = await getHomeEditorState();
  const canEdit = hasPermission(user.permissions, 'cms_page.update');

  return (
    <div className="space-y-5">
      <PageHeader
        title="Home page"
        description="Change the words, numbers, links and the principal's photo on the first page of your website. No developer needed."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Content', href: '/admin/cms' }, { label: 'Home page' }]}
      />
      {canEdit ? (
        <HomeEditor initial={state.blocks as EditorBlock[]} />
      ) : (
        <p className="rounded-lg border border-line bg-white p-5 text-sm text-ink-soft">You can see the home page but your role cannot change it. Ask an administrator for the “update pages” permission.</p>
      )}
    </div>
  );
}
