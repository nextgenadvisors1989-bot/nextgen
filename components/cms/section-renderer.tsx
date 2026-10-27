'use client';

/**
 * The public page-block renderer.
 *
 * Every block an editor composes in the CMS is stored as one `cms_page_sections`
 * row: a type, a heading, optional prose and — for the list-style blocks — an
 * `items` array. This component is the only place that knows how each type looks,
 * so a page built in the admin panel renders identically on the public site
 * without any per-page code.
 *
 * Accordions use native `<details>` so they work without JavaScript; tabs are the
 * one genuinely interactive block and are handled with local state.
 */
import { useState } from 'react';

export interface CmsSectionItem {
  title?: string | null;
  subtitle?: string | null;
  text?: string | null;
  value?: string | null;
  label?: string | null;
  icon?: string | null;
  image?: string | null;
  link?: string | null;
  linkLabel?: string | null;
  question?: string | null;
  answer?: string | null;
  price?: string | null;
  features?: string[] | null;
}

export interface CmsSection {
  id: number | string;
  section_type: string;
  heading?: string | null;
  subheading?: string | null;
  content_html?: string | null;
  content_json?: unknown;
  image_url?: string | null;
  background_color?: string | null;
  status?: string;
}

/** `content_json` is stored as text but may arrive already decoded. */
export function parseSectionItems(section: CmsSection): CmsSectionItem[] {
  const raw = section.content_json as unknown;
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (Array.isArray(parsed)) return parsed as CmsSectionItem[];
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown[] }).items)) {
    return (parsed as { items: CmsSectionItem[] }).items;
  }
  return [];
}

function Heading({ section, centered = true }: { section: CmsSection; centered?: boolean }) {
  if (!section.heading && !section.subheading) return null;
  return (
    <div className={centered ? 'text-center' : undefined}>
      {section.heading && <h2 className="text-2xl font-bold text-ink lg:text-3xl">{section.heading}</h2>}
      {section.subheading && (
        <p className={`mt-3 text-[15px] leading-relaxed text-ink-muted ${centered ? 'mx-auto max-w-2xl' : 'max-w-3xl'}`}>
          {section.subheading}
        </p>
      )}
    </div>
  );
}

function Prose({ html, className = '' }: { html: string; className?: string }) {
  return (
    <div
      className={`space-y-3 text-[15px] leading-relaxed text-ink-soft ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function Icon({ path }: { path?: string | null }) {
  if (!path) return null;
  // An icon is either an SVG path (as the built-in catalogue uses) or an image URL.
  if (/^https?:\/\//.test(path) || path.startsWith('/api/files/')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={path} alt="" className="h-8 w-8 object-contain" />;
  }
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d={path} />
    </svg>
  );
}

function ActionLink({ href, label, primary = true }: { href?: string | null; label?: string | null; primary?: boolean }) {
  if (!href || !label) return null;
  const classes = primary
    ? 'rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600'
    : 'rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface-muted';
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={classes}>
        {label}
      </a>
    );
  }
  return (
    <a href={href} className={classes}>
      {label}
    </a>
  );
}

export function CmsSectionBlock({ section }: { section: CmsSection }) {
  const items = parseSectionItems(section);
  const type = section.section_type;
  const background = section.background_color ?? undefined;

  /* ── hero ───────────────────────────────────────────────────────────── */
  if (type === 'hero') {
    return (
      <section className="relative border-b border-line" style={{ backgroundColor: background }}>
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-2 lg:items-center lg:px-8">
          <div>
            {section.heading && <h1 className="text-3xl font-bold text-ink lg:text-4xl">{section.heading}</h1>}
            {section.subheading && <p className="mt-4 text-lg leading-relaxed text-ink-muted">{section.subheading}</p>}
            {section.content_html && <Prose html={section.content_html} className="mt-5" />}
            <div className="mt-7 flex flex-wrap gap-3">
              <ActionLink href={items[0]?.link} label={items[0]?.linkLabel ?? items[0]?.title} />
              <ActionLink href={items[1]?.link} label={items[1]?.linkLabel ?? items[1]?.title} primary={false} />
            </div>
          </div>
          {section.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={section.image_url}
              alt={section.heading ?? ''}
              className="max-h-80 w-full rounded-xl border border-line object-cover"
            />
          )}
        </div>
      </section>
    );
  }

  /* ── stats ──────────────────────────────────────────────────────────── */
  if (type === 'stats') {
    return (
      <section className="border-y border-line bg-surface-muted" style={{ backgroundColor: background }}>
        <div className="mx-auto max-w-6xl px-4 py-12 lg:px-8">
          <Heading section={section} />
          <div className="mt-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
            {items.map((item, index) => (
              <div key={index} className="text-center">
                <p className="text-3xl font-bold text-brand-600">{item.value ?? item.title}</p>
                <p className="mt-1 text-sm text-ink-muted">{item.label ?? item.subtitle}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  /* ── features / services / team / testimonials / pricing ────────────── */
  if (['features', 'services', 'team', 'testimonials', 'pricing'].includes(type)) {
    const columns = items.length <= 2 ? 'md:grid-cols-2' : items.length === 4 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-2 xl:grid-cols-3';
    return (
      <section style={{ backgroundColor: background }}>
        <div className="mx-auto max-w-6xl px-4 py-14 lg:px-8">
          <Heading section={section} />
          {section.content_html && <Prose html={section.content_html} className="mx-auto mt-4 max-w-3xl text-center" />}
          <div className={`mt-10 grid grid-cols-1 gap-6 ${columns}`}>
            {items.map((item, index) => (
              <article
                key={index}
                className={`rounded-xl border border-line p-6 ${type === 'pricing' ? 'bg-white' : ''} ${type === 'testimonials' ? 'bg-surface-muted' : ''}`}
              >
                {type === 'team' && item.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image} alt={item.title ?? ''} className="mb-4 h-20 w-20 rounded-full object-cover" />
                )}
                {type !== 'team' && type !== 'pricing' && <div className="text-brand-600"><Icon path={item.icon} /></div>}
                {type === 'pricing' && <p className="text-2xl font-bold text-ink">{item.price ?? item.value}</p>}
                {item.title && <h3 className={`text-lg font-semibold text-ink ${type === 'pricing' ? 'mt-2' : type === 'features' || type === 'services' ? 'mt-4' : 'mt-2'}`}>{item.title}</h3>}
                {item.subtitle && <p className="mt-1 text-xs uppercase tracking-wide text-ink-muted">{item.subtitle}</p>}
                {(item.text || item.answer) && (
                  <p className="mt-3 text-sm leading-relaxed text-ink-muted">{item.text ?? item.answer}</p>
                )}
                {Array.isArray(item.features) && item.features.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {item.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-start gap-2 text-sm text-ink-soft">
                        <span className="mt-0.5 text-emerald-600">✓</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {item.link && item.linkLabel && (
                  <div className="mt-5">
                    <ActionLink href={item.link} label={item.linkLabel} primary={false} />
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  /* ── faq / accordion ────────────────────────────────────────────────── */
  if (type === 'faq' || type === 'accordion') {
    return (
      <section style={{ backgroundColor: background }}>
        <div className="mx-auto max-w-3xl px-4 py-14 lg:px-8">
          <Heading section={section} />
          {section.content_html && <Prose html={section.content_html} className="mt-4" />}
          <div className="mt-8 divide-y divide-line rounded-xl border border-line">
            {items.map((item, index) => (
              <details key={index} className="group px-5 py-4" open={index === 0}>
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-[15px] font-medium text-ink">
                  {item.question ?? item.title}
                  <span className="text-brand-600 transition-transform group-open:rotate-45">＋</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">{item.answer ?? item.text}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    );
  }

  /* ── tabs ───────────────────────────────────────────────────────────── */
  if (type === 'tabs') {
    const [active, setActive] = useState(0);
    return (
      <section style={{ backgroundColor: background }}>
        <div className="mx-auto max-w-4xl px-4 py-14 lg:px-8">
          <Heading section={section} />
          <div className="mt-8 flex flex-wrap gap-2 border-b border-line">
            {items.map((item, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setActive(index)}
                className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  active === index ? 'border-brand-500 text-brand-600' : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                {item.title}
              </button>
            ))}
          </div>
          <div className="pt-6">
            {items[active]?.text && <Prose html={items[active].text ?? ''} />}
            {items[active]?.answer && <Prose html={items[active].answer ?? ''} />}
          </div>
        </div>
      </section>
    );
  }

  /* ── table ──────────────────────────────────────────────────────────── */
  if (type === 'table') {
    const columns = items[0]?.features ?? [];
    return (
      <section style={{ backgroundColor: background }}>
        <div className="mx-auto max-w-4xl px-4 py-14 lg:px-8">
          <Heading section={section} />
          <div className="mt-8 overflow-x-auto rounded-xl border border-line">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-surface-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-[13px] font-semibold text-ink-soft">{section.subheading ?? 'Item'}</th>
                  {columns.map((column, index) => (
                    <th key={index} className="px-4 py-3 text-left text-[13px] font-semibold text-ink-soft">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.slice(1).map((row, index) => (
                  <tr key={index} className="border-t border-line">
                    <td className="px-4 py-3 font-medium text-ink">{row.title}</td>
                    {(row.features ?? []).map((cell, cellIndex) => (
                      <td key={cellIndex} className="px-4 py-3 text-ink-muted">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {section.content_html && <Prose html={section.content_html} className="mt-5" />}
        </div>
      </section>
    );
  }

  /* ── gallery ────────────────────────────────────────────────────────── */
  if (type === 'gallery') {
    return (
      <section style={{ backgroundColor: background }}>
        <div className="mx-auto max-w-6xl px-4 py-14 lg:px-8">
          <Heading section={section} />
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3">
            {items.map((item, index) => (
              <figure key={index} className="overflow-hidden rounded-xl border border-line">
                {item.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image} alt={item.title ?? ''} className="h-44 w-full object-cover" />
                )}
                {item.title && <figcaption className="px-3 py-2 text-xs text-ink-muted">{item.title}</figcaption>}
              </figure>
            ))}
          </div>
        </div>
      </section>
    );
  }

  /* ── image ──────────────────────────────────────────────────────────── */
  if (type === 'image') {
    return (
      <section style={{ backgroundColor: background }}>
        <div className="mx-auto max-w-4xl px-4 py-12 lg:px-8">
          <Heading section={section} />
          {section.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={section.image_url} alt={section.heading ?? ''} className="mt-6 w-full rounded-xl border border-line object-cover" />
          )}
          {section.subheading && <p className="mt-3 text-center text-xs text-ink-muted">{section.subheading}</p>}
          {section.content_html && <Prose html={section.content_html} className="mt-4" />}
        </div>
      </section>
    );
  }

  /* ── cta / contact_form ─────────────────────────────────────────────── */
  if (type === 'cta' || type === 'contact_form') {
    const href = items[0]?.link ?? '/contact';
    const label = items[0]?.linkLabel ?? items[0]?.title ?? 'Contact us';
    return (
      <section style={{ backgroundColor: background ?? '#1e293b' }}>
        <div className="mx-auto max-w-4xl px-4 py-14 text-center lg:px-8">
          {section.heading && <h2 className="text-2xl font-bold text-white lg:text-3xl">{section.heading}</h2>}
          {section.subheading && <p className="mx-auto mt-3 max-w-2xl text-[15px] leading-relaxed text-white/80">{section.subheading}</p>}
          {section.content_html && (
            <div className="mt-4 space-y-3 text-[15px] text-white/80" dangerouslySetInnerHTML={{ __html: section.content_html }} />
          )}
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <ActionLink href={href} label={label} />
          </div>
        </div>
      </section>
    );
  }

  /* ── text / richtext / custom (and anything unknown) ────────────────── */
  return (
    <section style={{ backgroundColor: background }}>
      <div className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
        <Heading section={section} centered={false} />
        {section.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={section.image_url} alt={section.heading ?? ''} className="mt-6 w-full rounded-xl border border-line object-cover" />
        )}
        {section.content_html && <Prose html={section.content_html} className="mt-5" />}
        {items.length > 0 && (
          <ul className="mt-6 space-y-3">
            {items.map((item, index) => (
              <li key={index} className="rounded-lg border border-line p-4">
                {item.title && <p className="text-sm font-semibold text-ink">{item.title}</p>}
                {(item.text || item.answer) && <p className="mt-1 text-sm text-ink-muted">{item.text ?? item.answer}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function CmsSectionList({ sections }: { sections: CmsSection[] }) {
  return (
    <>
      {sections.map((section) => (
        <CmsSectionBlock key={String(section.id)} section={section} />
      ))}
    </>
  );
}
