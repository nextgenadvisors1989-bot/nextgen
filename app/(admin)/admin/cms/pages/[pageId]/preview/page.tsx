import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/permission-check';
import { getPageDetail } from '@/services/cms.service';
import { CmsSectionList, type CmsSection } from '@/components/cms/section-renderer';
import { Badge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils/dates';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ pageId: string }> }): Promise<Metadata> {
  const { pageId } = await params;
  try {
    const detail = await getPageDetail(Number(pageId));
    return { title: `Preview — ${String(detail.page.title)}` };
  } catch {
    return { title: 'Preview' };
  }
}

/**
 * The page exactly as it will render publicly, drawn by the same renderer the
 * public site uses. Hidden blocks are marked rather than dropped, so an editor
 * can see what is switched off without having to leave the preview.
 */
export default async function CmsPagePreview({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const id = Number(pageId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  await requirePageUser();

  let detail: Awaited<ReturnType<typeof getPageDetail>>;
  try {
    detail = await getPageDetail(id);
  } catch {
    notFound();
  }

  const page = detail.page;
  const sections = detail.sections as unknown as {
    id: number;
    section_type: string;
    heading: string | null;
    subheading: string | null;
    content_html: string | null;
    content_json: unknown;
    image_url: string | null;
    background_color: string | null;
    status: string;
  }[];

  const active = sections
    .filter((row) => row.status === 'active')
    .map((row) => JSON.parse(JSON.stringify(row)) as CmsSection);
  const hidden = sections.filter((row) => row.status !== 'active');

  return (
    <div className="space-y-5">
      <nav className="text-sm text-ink-muted">
        <Link href="/admin/cms/pages" className="text-brand-600 hover:underline">Pages</Link>
        <span className="mx-2">/</span>
        <Link href={`/admin/cms/pages/${id}`} className="text-brand-600 hover:underline">{String(page.title)}</Link>
        <span className="mx-2">/</span>
        <span className="text-ink-soft">Preview</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Preview — {String(page.title)}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Rendered by the public page renderer, with hidden blocks marked. Nothing here changes the live site.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={page.status === 'published' ? 'success' : page.status === 'scheduled' ? 'warning' : page.status === 'archived' ? 'danger' : 'slate'} dot>
            {String(page.status)}
          </Badge>
          <LinkButton href={`/admin/cms/pages/${id}`} variant="outline" size="sm">Back to the editor</LinkButton>
          {page.status === 'published' && (
            <LinkButton href={`/${String(page.slug)}`} size="sm">Open the live page</LinkButton>
          )}
        </div>
      </header>

      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="border-b border-line bg-surface-muted px-4 py-2 text-[12px] text-ink-muted">
          /{String(page.slug)}
          {page.meta_title ? ` · title: ${String(page.meta_title)}` : ''}
          {page.meta_description ? ` · description: ${String(page.meta_description).slice(0, 90)}…` : ''}
        </div>

        {page.hero_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={String(page.hero_image)} alt={String(page.title)} className="max-h-80 w-full object-cover" />
        ) : null}

        <div className="mx-auto max-w-4xl px-4 py-10 lg:px-8">
          <h1 className="text-3xl font-bold text-ink">{String(page.title)}</h1>
          {page.subtitle ? <p className="mt-3 text-lg text-ink-muted">{String(page.subtitle)}</p> : null}
          {page.content_html ? (
            <div
              className="prose prose-slate mt-6 max-w-none space-y-3 text-[15px] leading-relaxed text-ink-soft"
              dangerouslySetInnerHTML={{ __html: String(page.content_html) }}
            />
          ) : null}
        </div>

        <CmsSectionList sections={active} />

        {hidden.length > 0 && (
          <div className="border-t border-line">
            <div className="bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
              {hidden.length} block(s) below are switched off and do not render on the public page.
            </div>
            <div className="divide-y divide-line opacity-60">
              {hidden.map((row) => (
                <div key={row.id} className="px-4 py-4">
                  <p className="text-sm font-medium text-ink">
                    {row.heading ?? row.section_type} <span className="ml-2 text-[11px] text-ink-muted">hidden</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="text-[12px] text-ink-muted">
        Last edited {formatDateTime(String(page.updated_at))}
        {page.published_at ? ` · published ${formatDateTime(String(page.published_at))}` : ''}
        {page.scheduled_at ? ` · scheduled for ${formatDateTime(String(page.scheduled_at))}` : ''}
      </p>
    </div>
  );
}
