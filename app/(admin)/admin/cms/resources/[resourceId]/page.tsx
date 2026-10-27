import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { getResourceDetail } from '@/services/cms.service';
import { actOptions } from '@/services/compliance.service';
import { ResourceForm, type ResourceDetailRow } from '@/components/cms/resource-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ resourceId: string }> }): Promise<Metadata> {
  const { resourceId } = await params;
  try {
    const detail = await getResourceDetail(Number(resourceId));
    return { title: `Resource — ${String(detail.resource.title)}` };
  } catch {
    return { title: 'Resource' };
  }
}

export default async function ResourceDetailPage({ params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params;
  const id = Number(resourceId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await requirePageUser();

  let detail: Awaited<ReturnType<typeof getResourceDetail>>;
  try {
    detail = await getResourceDetail(id);
  } catch {
    notFound();
  }

  const acts = await actOptions();
  const resource = JSON.parse(JSON.stringify(detail.resource)) as ResourceDetailRow;
  const act = acts.find((entry) => entry.value === String(resource.act_id ?? ''));
  const row: ResourceDetailRow = { ...resource, act_name: act?.label ?? null };

  return (
    <div className="space-y-5">
      <nav className="text-sm text-ink-muted">
        <Link href="/admin/cms/resources" className="text-brand-600 hover:underline">Resources</Link>
        <span className="mx-2">/</span>
        <Link href={`/admin/cms/resources/${id}`} className="text-brand-600 hover:underline">{row.title}</Link>
        <span className="mx-2">/</span>
        <span className="text-ink-soft">Edit</span>
      </nav>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">{row.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {row.act_name ? `Explains ${row.act_name}. ` : ''}
            {row.published_at ? `In the public library since ${row.published_at.slice(0, 10)}. ` : 'Not in the public library yet. '}
            Downloaded {Number(row.download_count)} time(s).
          </p>
        </div>
        {row.status === 'published' && (
          <Link href={`/resources/${row.slug}`} className="text-[13px] text-brand-600 hover:underline">
            Open it on the public site →
          </Link>
        )}
      </header>
      <ResourceForm
        mode="edit"
        resource={row}
        actOptions={acts}
        canEdit={hasPermission(user.permissions, 'cms_resource.update')}
      />
    </div>
  );
}
