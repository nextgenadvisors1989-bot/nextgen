import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { cmsOverview } from '@/services/cms.service';
import { Card, CardBody, StatCard } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/dates';
import { formatNumber } from '@/lib/utils/formatting';
import { formatFileSize } from '@/lib/files/file-format';
import { CMS_PAGE_TYPE_LABELS } from '@/lib/validations/cms.validation';

export const metadata: Metadata = { title: 'Content Management' };
export const dynamic = 'force-dynamic';

export default async function CmsOverviewPage() {
  const user = await requirePageUser();
  const overview = await cmsOverview();

  const { pages, media, resources, recent, due } = overview;
  const canEditPages = hasPermission(user.permissions, 'cms_page.update');
  const canEditMedia = hasPermission(user.permissions, 'cms_media.update');
  const canEditResources = hasPermission(user.permissions, 'cms_resource.update');

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Content Management</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-muted">
            The public website is served from here: pages and their blocks, the media library the pages draw from, and
            the downloadable resources behind the Downloads section. Publishing, scheduling and archiving all run
            through the same state machine the public read path enforces.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasPermission(user.permissions, 'cms_page.read') && <LinkButton href="/admin/cms/pages" variant="outline" size="sm">Pages</LinkButton>}
          {hasPermission(user.permissions, 'cms_media.read') && <LinkButton href="/admin/cms/media" variant="outline" size="sm">Media Library</LinkButton>}
          {hasPermission(user.permissions, 'cms_resource.read') && <LinkButton href="/admin/cms/resources" variant="outline" size="sm">Resources</LinkButton>}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Pages" value={formatNumber(pages.total)} tone="brand" hint={`${formatNumber(pages.sections)} blocks`} />
        <StatCard label="Live" value={formatNumber(pages.published)} tone="emerald" hint={pages.lastPublished ? formatDateTime(pages.lastPublished) : 'Nothing live yet'} />
        <StatCard label="Scheduled" value={formatNumber(pages.scheduled)} tone="amber" hint={pages.scheduledDue ? `${pages.scheduledDue} due now` : 'None due'} />
        <StatCard label="Media assets" value={formatNumber(media.total)} tone="violet" hint={formatFileSize(media.bytes)} />
        <StatCard label="Resources" value={formatNumber(resources.total)} tone="brand" hint={`${formatNumber(resources.downloads)} downloads`} />
        <StatCard label="Page views" value={formatNumber(pages.views)} tone="slate" hint="Public reads" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Recently edited pages</h2>
            {canEditPages && <LinkButton href="/admin/cms/pages/create" size="sm">New page</LinkButton>}
          </div>
          <div className="divide-y divide-line">
            {recent.map((page) => (
              <div key={String(page.id)} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link href={`/admin/cms/pages/${page.id}`} className="text-sm font-medium text-ink hover:text-brand-600">
                    {String(page.title)}
                  </Link>
                  <p className="font-mono text-[11px] text-ink-muted">/{String(page.slug)}</p>
                </div>
                <div className="text-right">
                  <Badge tone={page.status === 'published' ? 'success' : page.status === 'scheduled' ? 'warning' : 'slate'} dot>
                    {String(page.status)}
                  </Badge>
                  <p className="mt-1 text-[11px] text-ink-muted">{formatDateTime(String(page.updated_at))}</p>
                </div>
              </div>
            ))}
            {!recent.length && (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">
                No pages yet — create the first one and it appears here.
              </p>
            )}
          </div>
        </Card>

        <div className="space-y-5">
          <Card padded={false}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Waiting to publish themselves</h2>
              {hasPermission(user.permissions, 'cms_page.update') && (
                <Link href="/admin/cms/pages?status=scheduled" className="text-[13px] text-brand-600 hover:underline">
                  All scheduled
                </Link>
              )}
            </div>
            <div className="divide-y divide-line">
              {due.map((page) => (
                <div key={String(page.id)} className="flex items-center justify-between gap-3 px-4 py-3">
                  <Link href={`/admin/cms/pages/${page.id}`} className="text-sm text-ink hover:text-brand-600">
                    {String(page.title)}
                  </Link>
                  <span className="text-[12px] text-ink-muted">{formatDateTime(String(page.scheduled_at))}</span>
                </div>
              ))}
              {!due.length && <p className="px-4 py-6 text-center text-sm text-ink-muted">Nothing scheduled.</p>}
            </div>
            {due.length > 0 && (
              <p className="border-t border-line px-4 py-3 text-[12px] text-ink-muted">
                The scheduled-publishing job promotes these on its five-minute tick; an overdue page is also promoted the
                moment a visitor reads it, so the moment holds even if the job lags.
              </p>
            )}
          </Card>

          <Card>
            <CardBody className="space-y-3">
              <h2 className="section-title">Library health</h2>
              <dl className="grid grid-cols-2 gap-3 text-[13px]">
                <div className="rounded-lg border border-line p-3">
                  <dt className="text-[11px] uppercase tracking-wide text-ink-muted">Images</dt>
                  <dd className="mt-0.5 text-ink">{formatNumber(media.images)}</dd>
                </div>
                <div className="rounded-lg border border-line p-3">
                  <dt className="text-[11px] uppercase tracking-wide text-ink-muted">Folders</dt>
                  <dd className="mt-0.5 text-ink">{formatNumber(media.folders)}</dd>
                </div>
                <div className="rounded-lg border border-line p-3">
                  <dt className="text-[11px] uppercase tracking-wide text-ink-muted">Uploaded resources</dt>
                  <dd className="mt-0.5 text-ink">{formatNumber(resources.uploaded)}</dd>
                </div>
                <div className="rounded-lg border border-line p-3">
                  <dt className="text-[11px] uppercase tracking-wide text-ink-muted">Sign-in gated</dt>
                  <dd className="mt-0.5 text-ink">{formatNumber(resources.gated)}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                {canEditMedia && <LinkButton href="/admin/cms/media" size="sm" variant="outline">Open the libraries</LinkButton>}
                {canEditResources && <LinkButton href="/admin/cms/resources/create" size="sm" variant="outline">New resource</LinkButton>}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardBody className="space-y-3">
          <h2 className="section-title">Pages by type</h2>
          <div className="flex flex-wrap gap-2">
            {pages.byType.map((entry) => (
              <Link
                key={entry.page_type}
                href={`/admin/cms/pages?page_type=${entry.page_type}`}
                className="rounded-lg border border-line px-3 py-2 text-[13px] text-ink-soft hover:bg-surface-muted"
              >
                {CMS_PAGE_TYPE_LABELS[entry.page_type] ?? entry.page_type}
                <span className="ml-2 text-ink-muted">{formatNumber(entry.total)}</span>
              </Link>
            ))}
            {resources.byType.map((entry) => (
              <Link
                key={entry.resource_type}
                href={`/admin/cms/resources?resource_type=${entry.resource_type}`}
                className="rounded-lg border border-line px-3 py-2 text-[13px] text-ink-soft hover:bg-surface-muted"
              >
                {entry.resource_type} resources
                <span className="ml-2 text-ink-muted">{formatNumber(entry.total)}</span>
              </Link>
            ))}
            {!pages.byType.length && !resources.byType.length && (
              <p className="text-sm text-ink-muted">Nothing published or drafted yet.</p>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
