import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { PagesRegister } from '@/components/cms/pages-register';

export const metadata: Metadata = { title: 'CMS Pages' };
export const dynamic = 'force-dynamic';

export default async function CmsPagesPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Pages</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Every page on the public website: served at its slug address the moment it is published, composed from blocks,
          placed in the menu or kept out of it, and scheduled to go live on its own when that suits better. Archiving is
          a soft delete, so nothing is ever lost from the register.
        </p>
      </header>
      <PagesRegister
        canCreate={hasPermission(user.permissions, 'cms_page.create')}
        canEdit={hasPermission(user.permissions, 'cms_page.update')}
        canDelete={hasPermission(user.permissions, 'cms_page.delete')}
      />
    </div>
  );
}
