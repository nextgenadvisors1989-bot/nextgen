import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { actOptions } from '@/services/compliance.service';
import { ResourceForm } from '@/components/cms/resource-form';

export const metadata: Metadata = { title: 'New Resource' };
export const dynamic = 'force-dynamic';

export default async function CreateResourcePage() {
  const user = await requirePageUser();
  const acts = await actOptions();

  return (
    <div className="space-y-5">
      <nav className="text-sm text-ink-muted">
        <Link href="/admin/cms/resources" className="text-brand-600 hover:underline">Resources</Link>
        <span className="mx-2">/</span>
        <span className="text-ink-soft">New resource</span>
      </nav>
      <header>
        <h1 className="text-xl font-semibold text-ink">Add a resource</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          A resource needs a file or an address — the platform refuses one that leads nowhere. Published resources
          appear in the Downloads section of the public Resources page immediately, with their download count kept.
        </p>
      </header>
      <ResourceForm
        mode="create"
        actOptions={acts}
        canEdit={hasPermission(user.permissions, 'cms_resource.create')}
      />
    </div>
  );
}
