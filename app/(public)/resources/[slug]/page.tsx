import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publishedResource } from '@/services/cms.service';
import { formatDate } from '@/lib/utils/dates';
import { formatNumber } from '@/lib/utils/formatting';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const resource = await publishedResource((await params).slug);
  if (!resource) return { title: 'Resource not found' };
  return {
    title: resource.title,
    description: resource.description ?? `${resource.resource_type} published by our compliance team.`,
  };
}

export default async function ResourceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const resource = await publishedResource((await params).slug);
  if (!resource) notFound();

  const downloadHref = `/api/public/resources/${resource.slug}/file`;

  return (
    <article className="py-14">
      <div className="mx-auto max-w-3xl px-4 lg:px-8">
        <Link href="/resources" className="text-sm font-medium text-brand-600 hover:underline">
          ← All resources
        </Link>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
            {resource.resource_type}
          </span>
          {resource.category && <span className="text-xs text-ink-muted">{resource.category}</span>}
          {resource.act_name && <span className="text-xs text-ink-muted">· {resource.act_name}</span>}
        </div>

        <h1 className="mt-4 text-3xl font-bold text-ink lg:text-4xl">{resource.title}</h1>
        <p className="mt-3 text-sm text-ink-muted">
          Published {formatDate(resource.published_at)}
          {resource.has_file ? ` · ${formatNumber(resource.download_count)} download(s)` : ''}
          {resource.requires_login ? ' · sign-in required to download' : ''}
        </p>

        {resource.description && (
          <div className="prose prose-slate mt-8 max-w-none whitespace-pre-line text-[15px] leading-relaxed text-ink-soft">
            {resource.description}
          </div>
        )}

        <div className="mt-10 rounded-xl border border-line bg-surface-muted p-6">
          <h2 className="text-lg font-semibold text-ink">
            {resource.has_file ? 'Download this resource' : 'Open this resource'}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            {resource.has_file
              ? 'The file is served from our document vault, so the copy you take away is the copy we published.'
              : 'This resource lives at an external address; the link opens in a new tab.'}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {resource.file_id ? (
              <a
                href={downloadHref}
                className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                Download {resource.file_name ? `· ${resource.file_name}` : ''}
              </a>
            ) : resource.external_url ? (
              <a
                href={resource.external_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                Open the resource
              </a>
            ) : null}
            {resource.requires_login && (
              <Link
                href={`/login?next=${encodeURIComponent(`/resources/${resource.slug}`)}`}
                className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:bg-white"
              >
                Sign in
              </Link>
            )}
            <Link href="/contact" className="text-sm font-medium text-brand-600 hover:underline">
              Ask a question about this resource
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
