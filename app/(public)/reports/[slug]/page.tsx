/**
 * A published report page — the detail behind a card on `/reports`.
 *
 * Reports are authored as CMS pages of type `report`; this route is their public
 * address. It exists separately from the general `/[slug]` catch-all because that
 * route matches a single path segment, so `/reports/<slug>` would otherwise fall
 * through to a 404. A slug that is not a published report is a 404 here too —
 * the platform never renders a page an editor has not published.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { publishedPage } from '@/services/cms.service';
import { CmsArticle } from '@/components/cms/page-article';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  try {
    const { page } = await publishedPage((await params).slug);
    return {
      title: (page.meta_title as string | null) ?? String(page.title),
      description: (page.meta_description as string | null) ?? (page.subtitle as string | null) ?? undefined,
      keywords: (page.meta_keywords as string | null) ?? undefined,
    };
  } catch {
    return { title: 'Report not found' };
  }
}

export default async function PublishedReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let bundle: Awaited<ReturnType<typeof publishedPage>> | null = null;
  try {
    bundle = await publishedPage(slug);
  } catch {
    bundle = null;
  }
  if (!bundle) notFound();

  return (
    <CmsArticle
      bundle={bundle as Parameters<typeof CmsArticle>[0]['bundle']}
      backHref="/reports"
      backLabel="All reports"
      badge="Report"
    />
  );
}
