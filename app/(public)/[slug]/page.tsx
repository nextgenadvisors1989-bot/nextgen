/**
 * Any published CMS page, by slug — a resource article, a published report, a
 * blog post, a landing page, a legal notice or an FAQ page.
 *
 * Fixed routes (`/about`, `/services`, `/contact`, …) live in their own folders
 * and, because Next.js matches static segments before dynamic ones, they always
 * win. A slug that matches nothing published is a 404: the platform never renders
 * a page an editor has not published.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
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
    return { title: 'Page not found' };
  }
}

export default async function CmsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let bundle: Awaited<ReturnType<typeof publishedPage>> | null = null;
  try {
    bundle = await publishedPage(slug);
  } catch {
    bundle = null;
  }
  if (!bundle) notFound();

  return <CmsArticle bundle={bundle as Parameters<typeof CmsArticle>[0]['bundle']} />;
}
