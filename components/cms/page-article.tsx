/**
 * One published CMS page, drawn once.
 *
 * Both the general catch-all (`/[slug]`) and the reports section
 * (`/reports/[slug]`) render a published page, so the article layout lives here
 * and each route only supplies its own breadcrumb. Keeping it in one place means
 * a block type added to the CMS renders identically wherever a page is read.
 */
import Link from 'next/link';
import { CmsSectionList } from '@/components/cms/section-renderer';
import { formatDate } from '@/lib/utils/dates';
import { formatNumber } from '@/lib/utils/formatting';

export interface CmsArticleBundle {
  page: Record<string, unknown>;
  sections: {
    id: number | string;
    section_type: string;
    heading?: string | null;
    subheading?: string | null;
    content_html?: string | null;
    content_json?: unknown;
    image_url?: string | null;
    background_color?: string | null;
    status?: string;
  }[];
}

export function CmsArticle({
  bundle,
  backHref,
  backLabel,
  badge,
}: {
  bundle: CmsArticleBundle;
  backHref?: string;
  backLabel?: string;
  badge?: string;
}) {
  const { page, sections } = bundle;
  const body = String(page.content_html ?? '').trim();
  const author = page.author_first ? `${String(page.author_first)} ${String(page.author_last ?? '')}`.trim() : null;

  return (
    <article>
      <section className="border-b border-line bg-surface-muted py-14">
        <div className="mx-auto max-w-4xl px-4 lg:px-8">
          {backHref && backLabel && (
            <Link href={backHref} className="text-sm font-medium text-brand-600 hover:underline">
              ← {backLabel}
            </Link>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {badge && (
              <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">{badge}</span>
            )}
            {page.subtitle ? (
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">{String(page.subtitle)}</p>
            ) : null}
          </div>
          <h1 className="mt-3 text-4xl font-bold text-ink">{String(page.title)}</h1>
          <p className="mt-4 text-sm text-ink-muted">
            Published {formatDate(page.published_at as string | null)}
            {author ? ` · ${author}` : ''}
            {Number(page.view_count) > 0 ? ` · ${formatNumber(Number(page.view_count))} view(s)` : ''}
          </p>
        </div>
      </section>

      {page.hero_image ? (
        <div className="mx-auto max-w-5xl px-4 pt-10 lg:px-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={String(page.hero_image)}
            alt={String(page.title)}
            className="max-h-96 w-full rounded-xl border border-line object-cover"
          />
        </div>
      ) : null}

      <div className="mx-auto max-w-4xl px-4 py-12 lg:px-8">
        {body && (
          <div className="space-y-4 text-[15px] leading-relaxed text-ink-soft" dangerouslySetInnerHTML={{ __html: body }} />
        )}

        {sections.length > 0 && (
          <div className="mt-10">
            <CmsSectionList
              sections={sections.map((section) => ({
                id: section.id,
                section_type: String(section.section_type),
                heading: section.heading ?? null,
                subheading: section.subheading ?? null,
                content_html: section.content_html ?? null,
                content_json: section.content_json,
                image_url: section.image_url ?? null,
                background_color: section.background_color ?? null,
                status: String(section.status ?? 'active'),
              }))}
            />
          </div>
        )}

        {!body && !sections.length && (
          <p className="rounded-xl border border-line p-6 text-sm text-ink-muted">
            This page does not have any content yet.
          </p>
        )}

        <div className="mt-14 border-t border-line pt-6">
          <Link href="/contact" className="text-sm font-medium text-brand-600 hover:underline">
            Questions about this page? Talk to our compliance team →
          </Link>
        </div>
      </div>
    </article>
  );
}
