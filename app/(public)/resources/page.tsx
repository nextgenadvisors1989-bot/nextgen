import type { Metadata } from 'next';
import Link from 'next/link';
import { listPublishedCmsPages, listPublicActs } from '@/services/public.service';
import { publishedResources } from '@/services/cms.service';
import { formatDate } from '@/lib/utils/dates';
import { truncate, formatNumber } from '@/lib/utils/formatting';

export const metadata: Metadata = {
  title: 'Resources',
  description: 'Guides, checklists, formats and explanatory notes published by our compliance team.',
};

export const dynamic = 'force-dynamic';

export default async function ResourcesPage() {
  const [resources, acts, downloads] = await Promise.all([
    listPublishedCmsPages('resource'),
    listPublicActs({ limit: 200 }),
    publishedResources(),
  ]);

  return (
    <>
      <section className="border-b border-line bg-surface-muted py-14">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <h1 className="text-4xl font-bold text-ink">Resources</h1>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-muted">
            Practical material from our compliance and audit teams: register formats, inspection checklists,
            statutory deadline notes and step-by-step guides.
          </p>
        </div>
      </section>

      <section className="py-14">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          {resources.length === 0 && downloads.length === 0 ? (
            <div className="rounded-xl border border-line p-10 text-center">
              <p className="text-lg font-semibold text-ink">Resources are being published</p>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
                Our team publishes guides and formats here from the content management module. In the meantime you
                can browse the legislation library, or ask us directly for the format you need — including
                Form A/B/C/D registers, the consolidated register under the Ease of Compliance Rules and
                inspection readiness checklists.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link href="/acts-compliance" className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface-muted">
                  Browse Acts
                </Link>
                <Link href="/contact" className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600">
                  Ask for a format
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {resources.map((resource) => (
                <article key={String(resource.id)} className="flex flex-col rounded-xl border border-line p-6">
                  <h2 className="text-lg font-semibold text-ink">{String(resource.title)}</h2>
                  {resource.subtitle && <p className="mt-1 text-sm text-ink-muted">{String(resource.subtitle)}</p>}
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-muted">
                    {String(resource.meta_description ?? truncate(String(resource.content_html ?? '').replace(/<[^>]+>/g, ' '), 160))}
                  </p>
                  <div className="mt-5 flex items-center justify-between">
                    <span className="text-xs text-ink-muted">Published {formatDate(resource.published_at as string | null)}</span>
                    <Link href={`/resources/${String(resource.slug)}`} className="text-sm font-medium text-brand-600 hover:underline">
                      Read
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}

          {downloads.length > 0 && (
            <div className="mt-14">
              <h2 className="text-2xl font-bold text-ink">Downloads</h2>
              <p className="mt-3 text-sm text-ink-muted">
                Formats, checklists and explanatory notes published by our team. Everything here is free to
                download; a few items ask you to sign in so we can tell you when they are revised.
              </p>
              <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {downloads.map((resource) => (
                  <article key={resource.slug} className="flex flex-col rounded-xl border border-line p-6">
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full bg-brand-100 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
                        {resource.resource_type}
                      </span>
                      {resource.category && <span className="text-[11px] text-ink-muted">{resource.category}</span>}
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-ink">{resource.title}</h3>
                    {resource.act_name && <p className="mt-1 text-xs text-ink-muted">{resource.act_name}</p>}
                    {resource.description && (
                      <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-muted">
                        {truncate(resource.description, 180)}
                      </p>
                    )}
                    <div className="mt-5 flex items-center justify-between">
                      <span className="text-xs text-ink-muted">
                        {resource.has_file ? `${formatNumber(resource.download_count)} download(s)` : 'External link'}
                        {resource.requires_login ? ' · sign-in required' : ''}
                      </span>
                      <Link href={`/resources/${resource.slug}`} className="text-sm font-medium text-brand-600 hover:underline">
                        Open
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {acts.length > 0 && (
            <div className="mt-14">
              <h2 className="text-2xl font-bold text-ink">Legislation library</h2>
              <p className="mt-3 text-sm text-ink-muted">
                Full-text references and applicability criteria for {acts.length} act(s) are available in the
                Acts &amp; Compliance library.
              </p>
              <Link href="/acts-compliance" className="mt-4 inline-block rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface-muted">
                Open the library
              </Link>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
