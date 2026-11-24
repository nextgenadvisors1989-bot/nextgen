/**
 * About Us. The text is the client's own ("About us" document), kept as the CMS page "About Us" (slug "about") so the administrator edits it with the Word-style
 * editor in Content & System > CMS > Pages. If that page is unpublished or deleted, the client's original text from lib/public/about-default.ts is shown, so the
 * page is never empty. The address and phone in the side panel come from Settings > Company Settings.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { getCompanyLegal } from '@/services/company.service';
import { publishedPage } from '@/services/cms.service';
import { CmsSectionList } from '@/components/cms/section-renderer';
import { sanitizeActHtml } from '@/lib/utils/sanitize-html';
import { withHeadingIds } from '@/lib/utils/anchors';
import { ABOUT_DEFAULT_HTML, ABOUT_SUBTITLE, ABOUT_TITLE } from '@/lib/public/about-default';

export const dynamic = 'force-dynamic';

const DESCRIPTION = 'NextGen Socio and Enviro Advisors: statutory compliance, industrial safety, occupational health, labour welfare, social compliance, environmental management, ESG and climate action - All Compliance Under One Umbrella.';

type Sections = NonNullable<Awaited<ReturnType<typeof publishedPage>>['sections']>;
interface AboutContent { title: string; subtitle: string; html: string; sections: Sections; metaTitle: string; metaDescription: string }

async function loadAbout(): Promise<AboutContent> {
  try {
    const { page, sections } = await publishedPage('about');
    const html = withHeadingIds(sanitizeActHtml(page.content_html));
    return {
      title: String(page.title || ABOUT_TITLE),
      subtitle: String(page.subtitle ?? ''),
      html: html.trim() || (sections.length ? '' : withHeadingIds(ABOUT_DEFAULT_HTML)),
      sections,
      metaTitle: String(page.meta_title || page.title || ABOUT_TITLE),
      metaDescription: String(page.meta_description || page.subtitle || DESCRIPTION),
    };
  } catch {
    return { title: ABOUT_TITLE, subtitle: ABOUT_SUBTITLE, html: withHeadingIds(ABOUT_DEFAULT_HTML), sections: [], metaTitle: `${ABOUT_TITLE} - NextGen Socio and Enviro Advisors`, metaDescription: DESCRIPTION };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const about = await loadAbout();
  return { title: about.metaTitle, description: about.metaDescription };
}

export default async function AboutPage() {
  const [about, company] = await Promise.all([loadAbout(), getCompanyLegal()]);
  return (
    <>
      <section className="border-b border-line bg-surface-muted py-14 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          {about.subtitle && <p className="text-sm font-semibold uppercase tracking-[0.14em] text-brand-700">{about.subtitle}</p>}
          <h1 className="mt-3 text-4xl font-bold text-ink sm:text-5xl">{about.title}</h1>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 lg:grid-cols-3 lg:px-8">
          <div className="lg:col-span-2">
            {about.html && <div className="page-prose" dangerouslySetInnerHTML={{ __html: about.html }} />}
            {about.sections.length > 0 && (
              <div className="mt-10">
                <CmsSectionList
                  sections={about.sections.map((section) => ({
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
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-xl border border-line p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Registered office</h2>
              <address className="mt-4 not-italic text-sm leading-relaxed text-ink-soft">
                {company.name}<br />
                <span className="block">{company.address}</span>
              </address>
              <dl className="mt-5 space-y-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-ink-muted">Email</dt><dd className="break-all text-right text-ink-soft">{company.email}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-ink-muted">Phone</dt><dd className="text-ink-soft">{company.phone}</dd></div>
                {company.gstin && <div className="flex justify-between gap-4"><dt className="text-ink-muted">GSTIN</dt><dd className="text-ink-soft">{company.gstin}</dd></div>}
                {company.cin && <div className="flex justify-between gap-4"><dt className="text-ink-muted">CIN</dt><dd className="text-ink-soft">{company.cin}</dd></div>}
              </dl>
            </div>

            <div className="rounded-xl bg-brand-50 p-6">
              <h2 className="text-sm font-semibold text-brand-800">Talk to our team</h2>
              <p className="mt-2 text-sm leading-relaxed text-brand-800">
                Tell us about your factory or establishment and we will come back with what applies to it.
              </p>
              <Link href="/contact" className="mt-4 inline-block rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-800">
                Contact us
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
