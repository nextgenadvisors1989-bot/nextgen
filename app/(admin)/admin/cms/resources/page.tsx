import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { ResourcesRegister } from '@/components/cms/resources-register';

export const metadata: Metadata = { title: 'Resources' };
export const dynamic = 'force-dynamic';

export default async function CmsResourcesPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Resources</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          The downloads library behind the public Resources page: formats, registers, checklists, circulars and guides.
          Each resource is either a file in the vault or an address elsewhere, optionally tied to the act it explains,
          optionally gated behind a sign-in, and its download count is tracked as people take it.
        </p>
      </header>
      <ResourcesRegister
        canCreate={hasPermission(user.permissions, 'cms_resource.create')}
        canEdit={hasPermission(user.permissions, 'cms_resource.update')}
        canDelete={hasPermission(user.permissions, 'cms_resource.delete')}
      />
    </div>
  );
}
