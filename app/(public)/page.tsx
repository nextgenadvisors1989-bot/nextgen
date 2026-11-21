import type { Metadata } from 'next';
import Link from 'next/link';
import { getHomeBlocks, getSiteInfo, type SiteItem } from '@/services/site.service';
import { SiteIcon } from '@/components/public/icons';
import { EnquiryForm } from '@/components/public/enquiry-form';
import { HomeDirectory, type DirectoryTab } from '@/components/public/home-directory';

export const metadata: Metadata = {
  title: 'One Legal Culture - Compliance | Safety | Sustainability',
  description:
    'Legal compliance, risk management, environment, safety and sustainability solutions: statutory audits, IS 14489 safety audits, ETP/STP assessment, HAZOP, energy and water audits and global certifications.',
};

export const dynamic = 'force-dynamic';

/*
 * Art direction: "the register". The page reads like a well-kept statutory register - paper tones, navy ink, one brass
 * accent, numbered sections (§ 01, § 02 …) and ruled rows instead of a wall of coloured cards. Every word comes from
 * the Home page editor (Admin -> Content -> Home page); nothing below is typed into the code except labels of buttons
 * that point at fixed pages of the platform.
 */
const FALLBACK_BUTTONS: SiteItem[] = [
  { title: 'Schedule a plant audit', link: '#contact' },
  { title: 'Browse Acts & Rules', link: '/acts-compliance' },
];

const isExternal = (href: string) => /^https?:\/\//.test(href);
const isPlainAnchor = (href: string) => /^(#|mailto:|tel:)/.test(href);

function ItemLink({ link, className, children, label }: { link?: string | null; className?: string; children: React.ReactNode; label?: string }) {
  if (!link) return <div className={className}>{children}</div>;
  if (isExternal(link)) return <a href={link} target="_blank" rel="noreferrer" className={className} aria-label={label}>{children}</a>;
  if (isPlainAnchor(link)) return <a href={link} className={className} aria-label={label}>{children}</a>;
  return <Link href={link} className={className} aria-label={label}>{children}</Link>;
}

function Label({ n, children, tone = 'light' }: { n: string; children: React.ReactNode; tone?: 'light' | 'dark' }) {
  return (
    <p className={`font-mono text-xs font-semibold uppercase tracking-[0.18em] ${tone === 'dark' ? 'text-[#C59B27]' : 'text-[#8A6612]'}`}>
      <span aria-hidden="true">§ {n}</span>
      <span aria-hidden="true" className="mx-2 inline-block h-px w-6 -translate-y-[3px] bg-current align-middle opacity-60" />
      {children}
    </p>
  );
}

const digits = (value: string) => value.replace(/\D/g, '');

export default async function HomePage() {
  const [blocks, site] = await Promise.all([getHomeBlocks(), getSiteInfo()]);
  const { hero, gateways, pillars, services, spotlight, statutory, acts, links_central, links_state, reports_grid, expertise, certifications, industries, proof, enquiry } = blocks;

  let n = 0;
  const next = () => String(++n).padStart(2, '0');

  const buttons = hero.items.filter((item) => item.title).slice(0, 2);
  const heroButtons = buttons.length ? buttons : FALLBACK_BUTTONS;
  const strapline = hero.subheading.split('|').map((part) => part.trim()).filter(Boolean);

  const directoryTabs: DirectoryTab[] = [
    { id: 'acts', label: acts.heading || 'Acts & Rules', icon: 'book', rows: acts.items.filter((i) => i.title).map((i) => ({ title: i.title!, subtitle: i.subtitle ?? undefined, link: i.link ?? '/acts-compliance' })), action: { label: 'View all Acts & Rules', href: '/acts-compliance' } },
    { id: 'central', label: links_central.heading || 'Central Government', icon: 'landmark', rows: links_central.items.filter((i) => i.title).map((i) => ({ title: i.title!, link: i.link ?? undefined })), action: { label: 'India.gov.in', href: 'https://india.gov.in' } },
    { id: 'state', label: links_state.heading || 'State Government', icon: 'building', rows: links_state.items.filter((i) => i.title).map((i) => ({ title: i.title!, link: i.link ?? undefined })), action: { label: 'Tamil Nadu Government portal', href: 'https://tn.gov.in' } },
    { id: 'reports', label: reports_grid.heading || 'Reports', icon: 'file', rows: reports_grid.items.filter((i) => i.title).map((i) => ({ title: i.title!, subtitle: i.subtitle ?? undefined, link: i.link ?? '/reports' })), action: { label: 'View all reports', href: '/reports' } },
  ];
  const showDirectory = !statutory.hidden && directoryTabs.some((tab) => tab.rows.length);

  const principalName = spotlight.heading || 'Kannan';
  const firstName = principalName.split(/\s+/)[0];
  const whatsapp = digits(site.whatsapp);
  const serviceNames = services.items.map((item) => item.title).filter((t): t is string => Boolean(t));

  return (
    <>
      {/* ── 1. the top banner: what we are, two ways in, and the sign-in panel ── */}
      <section className="border-b border-[#0B1E36]/10 bg-[#FAF7F0]">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-10 lg:px-8 lg:py-20">
          <div className="lg:col-span-7">
            {strapline.length > 0 && (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#8A6612]">
                {strapline.map((word, index) => (
                  <span key={word} className="flex items-center gap-3">
                    {index > 0 && <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#C59B27]" />}
                    {word}
                  </span>
                ))}
              </p>
            )}
            <h1 className="mt-5 font-display text-[2.6rem] font-semibold leading-[1.04] tracking-tight text-[#0B1E36] sm:text-6xl lg:text-7xl">{hero.heading}</h1>
            {hero.html && <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-700">{hero.html}</p>}

            <div className="mt-8 flex flex-wrap gap-3">
              {heroButtons.map((button, index) => (
                <ItemLink
                  key={index}
                  link={button.link}
                  className={`inline-flex min-h-[48px] items-center gap-2 rounded-sm px-6 text-[15px] font-bold transition-colors motion-reduce:transition-none ${
                    index === 0 ? 'bg-[#0B1E36] text-white hover:bg-[#16365c]' : 'border border-[#0B1E36] text-[#0B1E36] hover:bg-[#0B1E36] hover:text-white'
                  }`}
                >
                  <span>{button.title}</span>
                  <SiteIcon name="arrow" className={`h-4 w-4 ${index === 0 ? 'text-[#C59B27]' : ''}`} />
                </ItemLink>
              ))}
            </div>

            {pillars.items.length > 0 && !pillars.hidden && (
              <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-[#0B1E36]/15 pt-5 text-sm font-medium text-slate-700" aria-label="What we cover">
                {pillars.items.filter((i) => i.title).map((item, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rotate-45 bg-[#C59B27]" />
                    {item.title}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!gateways.hidden && gateways.items.length > 0 && (
            <aside className="lg:col-span-5" aria-labelledby="portal-heading">
              <div className="overflow-hidden rounded-sm border border-[#0B1E36]/20 bg-white shadow-[6px_6px_0_0_rgba(11,30,54,0.08)]">
                <div className="bg-[#0B1E36] px-6 py-5">
                  <h2 id="portal-heading" className="font-display text-xl font-semibold text-white">{gateways.heading}</h2>
                  {gateways.subheading && <p className="mt-1 text-sm text-slate-300">{gateways.subheading}</p>}
                </div>
                <ul>
                  {gateways.items.filter((i) => i.title).slice(0, 4).map((item, index) => (
                    <li key={index} className="border-b border-slate-200 last:border-0">
                      <ItemLink link={item.link || '/login'} className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-[#FAF7F0] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#C59B27]">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-[#0B1E36]/15 bg-[#FAF7F0] text-[#0B1E36]">
                          <SiteIcon name={item.icon} className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-bold text-[#0B1E36]">{item.title}</span>
                          {item.text && <span className="mt-0.5 block text-sm leading-snug text-slate-600">{item.text}</span>}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-[#8A6612]">
                          <span className="hidden sm:inline">{item.linkLabel || 'Sign in'}</span>
                          <SiteIcon name="arrow" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </ItemLink>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          )}
        </div>
      </section>

      {/* ── 2. the figures ── */}
      {!proof.hidden && proof.items.length > 0 && (
        <section aria-label="The company in figures" className="bg-[#0B1E36] text-white">
          <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-white/10 sm:grid-cols-3 lg:grid-cols-6">
            {proof.items.filter((i) => i.value).map((item, index) => (
              <div key={index} className="bg-[#0B1E36] px-4 py-7 text-center sm:px-6">
                <dd className="font-display text-3xl font-semibold leading-none text-[#E2B94A] sm:text-4xl">{item.value}</dd>
                <dt className="mt-2 text-sm font-medium text-slate-300">{item.label}</dt>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* ── 3. services: a numbered index ── */}
      {!services.hidden && services.items.length > 0 && (
        <section id="services" className="scroll-mt-24 bg-white py-16 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:gap-14 lg:px-8">
            <div className="lg:col-span-4">
              <div className="lg:sticky lg:top-28">
                <Label n={next()}>What we do</Label>
                <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight text-[#0B1E36] sm:text-4xl">{services.heading}</h2>
                {services.subheading && <p className="mt-4 text-base leading-relaxed text-slate-700">{services.subheading}</p>}
                <Link href="/services" className="mt-6 inline-flex min-h-[44px] items-center gap-2 text-[15px] font-bold text-[#0B1E36] underline decoration-[#C59B27] decoration-2 underline-offset-4 hover:text-[#8A6612]">
                  All services <SiteIcon name="arrow" className="h-4 w-4" />
                </Link>
              </div>
            </div>
            <ol className="border-t border-[#0B1E36] lg:col-span-8">
              {services.items.filter((i) => i.title).map((item, index) => (
                <li key={index} className="border-b border-slate-300">
                  <ItemLink link={item.link || '/services'} className="group grid gap-x-6 gap-y-1 py-5 transition-colors hover:bg-[#FAF7F0] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#C59B27] sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:px-3">
                    <span className="font-mono text-sm font-semibold text-[#8A6612]" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                    <span className="min-w-0">
                      <span className="block font-display text-xl font-semibold leading-snug text-[#0B1E36] group-hover:text-[#8A6612]">{item.title}</span>
                      {item.text && <span className="mt-1 block max-w-2xl text-[15px] leading-relaxed text-slate-700">{item.text}</span>}
                    </span>
                    <span className="flex items-center gap-1 text-sm font-bold text-[#0B1E36] sm:self-center">
                      <span className="sr-only sm:not-sr-only">{item.linkLabel || 'Read more'}</span>
                      <SiteIcon name="arrow" className="h-4 w-4 text-[#8A6612] transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </ItemLink>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* ── 4. the principal: photo, name and message (Admin -> Content -> Home page) ── */}
      {!spotlight.hidden && (
        <section id="principal" className="scroll-mt-24 border-y border-[#0B1E36]/10 bg-[#F6F2E7] py-16 lg:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:gap-16 lg:px-8">
            <figure className="mx-auto w-full max-w-xs lg:col-span-4 lg:max-w-sm">
              <div className="relative">
                <span aria-hidden="true" className="absolute -bottom-3 -right-3 h-full w-full rounded-sm border-2 border-[#C59B27]" />
                {spotlight.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={spotlight.imageUrl} alt={`${principalName}${spotlight.subheading ? `, ${spotlight.subheading}` : ''}`} width={640} height={800} loading="lazy" decoding="async" className="relative aspect-[4/5] w-full rounded-sm bg-[#0B1E36] object-cover object-top" />
                ) : (
                  <div role="img" aria-label={`${principalName} — photo to be added`} className="relative flex aspect-[4/5] w-full items-center justify-center rounded-sm bg-[#0B1E36]">
                    <span className="font-display text-[8rem] font-semibold leading-none text-[#C59B27]">{principalName.charAt(0).toUpperCase()}</span>
                  </div>
                )}
              </div>
            </figure>

            <div className="lg:col-span-7 lg:col-start-6">
              <Label n={next()}>Your point of contact</Label>
              <h2 className="mt-4 font-display text-4xl font-semibold tracking-tight text-[#0B1E36] sm:text-5xl">{principalName}</h2>
              {spotlight.subheading && <p className="mt-2 font-mono text-sm font-semibold uppercase tracking-[0.14em] text-[#8A6612]">{spotlight.subheading}</p>}
              <div className="mt-6 max-w-2xl border-l-4 border-[#C59B27] pl-5 sm:pl-6">
                <p className="whitespace-pre-line font-display text-xl leading-relaxed text-slate-800 sm:text-2xl sm:leading-relaxed">
                  {spotlight.html || `Talk to ${firstName} directly about the licences, returns, audits and certifications your plant needs.`}
                </p>
              </div>
              {spotlight.items.some((i) => i.title) && (
                <ul className="mt-6 flex flex-wrap gap-2" aria-label={`${principalName}'s credentials`}>
                  {spotlight.items.filter((i) => i.title).map((item, index) => (
                    <li key={index} className="rounded-sm border border-[#0B1E36]/25 bg-white px-3 py-1.5 text-sm font-semibold text-[#0B1E36]">{item.title}</li>
                  ))}
                </ul>
              )}
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#contact" className="inline-flex min-h-[48px] items-center gap-2 rounded-sm bg-[#0B1E36] px-6 text-[15px] font-bold text-white transition-colors hover:bg-[#16365c] motion-reduce:transition-none">
                  Talk to {firstName} <SiteIcon name="arrow" className="h-4 w-4 text-[#C59B27]" />
                </a>
                {site.phone && (
                  <a href={`tel:${site.phone.replace(/[^\d+]/g, '')}`} className="inline-flex min-h-[48px] items-center gap-2 rounded-sm border border-[#0B1E36] px-6 text-[15px] font-bold text-[#0B1E36] transition-colors hover:bg-[#0B1E36] hover:text-white motion-reduce:transition-none">
                    <SiteIcon name="phone" className="h-4 w-4" /> {site.phone}
                  </a>
                )}
                {whatsapp.length >= 10 && (
                  <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="inline-flex min-h-[48px] items-center gap-2 rounded-sm border border-[#0B1E36]/30 px-5 text-[15px] font-bold text-[#0B1E36] transition-colors hover:border-[#0B1E36] motion-reduce:transition-none">
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── 5. the statutory directory ── */}
      {showDirectory && (
        <section id="acts" className="scroll-mt-24 bg-white py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-10 max-w-3xl">
              <Label n={next()}>Statutory directory</Label>
              <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight text-[#0B1E36] sm:text-4xl">{statutory.heading}</h2>
              {statutory.subheading && <p className="mt-4 text-base leading-relaxed text-slate-700">{statutory.subheading}</p>}
            </div>
            <HomeDirectory tabs={directoryTabs} />
          </div>
        </section>
      )}

      {/* ── 6. expertise and industries ── */}
      {((!expertise.hidden && expertise.items.length > 0) || (!industries.hidden && industries.items.length > 0)) && (
        <section id="expertise" className="scroll-mt-24 bg-[#0B1E36] py-16 text-white lg:py-24">
          <div className="mx-auto max-w-7xl space-y-16 px-4 sm:px-6 lg:px-8">
            {!expertise.hidden && expertise.items.length > 0 && (
              <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
                <div className="lg:col-span-4">
                  <Label n={next()} tone="dark">{expertise.subheading || 'Expertise'}</Label>
                  <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{expertise.heading}</h2>
                </div>
                <ul className="grid gap-x-10 border-t border-white/25 sm:grid-cols-2 lg:col-span-8">
                  {expertise.items.filter((i) => i.title).map((item, index) => (
                    <li key={index} className="flex gap-3 border-b border-white/15 py-5">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-[#C59B27]"><SiteIcon name="check" className="h-5 w-5" /></span>
                      <div>
                        <h3 className="text-base font-bold text-white">{item.title}</h3>
                        {item.text && <p className="mt-1 text-[15px] leading-relaxed text-slate-300">{item.text}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!industries.hidden && industries.items.length > 0 && (
              <div>
                <div className="mb-8 flex flex-wrap items-end justify-between gap-3 border-b border-white/25 pb-4">
                  <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{industries.heading}</h2>
                  {industries.subheading && <p className="max-w-md text-[15px] text-slate-300">{industries.subheading}</p>}
                </div>
                <ul className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-5">
                  {industries.items.filter((i) => i.title).map((item, index) => (
                    <li key={index} className="flex flex-col gap-2">
                      <span className="flex h-10 w-10 items-center justify-center rounded-sm border border-[#C59B27]/60 text-[#E2B94A]"><SiteIcon name={item.icon} className="h-5 w-5" /></span>
                      <h3 className="text-base font-bold leading-snug">{item.title}</h3>
                      {item.text && <p className="text-sm leading-relaxed text-slate-300">{item.text}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── 7. standards and certifications ── */}
      {!certifications.hidden && certifications.items.length > 0 && (
        <section id="standards" className="scroll-mt-24 border-b border-[#0B1E36]/10 bg-[#FAF7F0] py-14 lg:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <Label n={next()}>{certifications.subheading || 'Standards'}</Label>
              <h2 className="mt-4 font-display text-2xl font-semibold leading-snug tracking-tight text-[#0B1E36] sm:text-3xl">{certifications.heading}</h2>
            </div>
            <ul className="mt-8 grid grid-cols-2 border-l border-t border-[#0B1E36]/20 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {certifications.items.filter((i) => i.title).map((item, index) => (
                <li key={index} className="border-b border-r border-[#0B1E36]/20 bg-white px-4 py-4">
                  <span className="block text-[15px] font-bold text-[#0B1E36]">{item.title}</span>
                  {item.subtitle && <span className="mt-0.5 block text-sm text-slate-600">{item.subtitle}</span>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── 8. the enquiry ── */}
      <section id="contact" className="scroll-mt-24 bg-white py-16 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
          <div>
            <Label n={next()}>Contact</Label>
            <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight text-[#0B1E36] sm:text-4xl">{enquiry.heading}</h2>
            {enquiry.subheading && <p className="mt-4 text-base leading-relaxed text-slate-700">{enquiry.subheading}</p>}

            <dl className="mt-8 divide-y divide-slate-200 border-y border-slate-300">
              {site.address && (
                <div className="flex gap-4 py-4">
                  <dt className="flex w-28 shrink-0 items-start gap-2 text-sm font-bold text-[#0B1E36]"><SiteIcon name="pin" className="mt-0.5 h-4 w-4 text-[#8A6612]" />Address</dt>
                  <dd className="min-w-0 text-[15px] leading-relaxed text-slate-700">{site.address}</dd>
                </div>
              )}
              {site.phone && (
                <div className="flex gap-4 py-4">
                  <dt className="flex w-28 shrink-0 items-start gap-2 text-sm font-bold text-[#0B1E36]"><SiteIcon name="phone" className="mt-0.5 h-4 w-4 text-[#8A6612]" />Phone</dt>
                  <dd className="min-w-0 text-[15px] text-slate-700">
                    <a href={`tel:${site.phone.replace(/[^\d+]/g, '')}`} className="font-medium hover:text-[#8A6612]">{site.phone}</a>
                    {site.phone2 && <> · <a href={`tel:${site.phone2.replace(/[^\d+]/g, '')}`} className="font-medium hover:text-[#8A6612]">{site.phone2}</a></>}
                  </dd>
                </div>
              )}
              {site.email && (
                <div className="flex gap-4 py-4">
                  <dt className="flex w-28 shrink-0 items-start gap-2 text-sm font-bold text-[#0B1E36]"><SiteIcon name="mail" className="mt-0.5 h-4 w-4 text-[#8A6612]" />E-mail</dt>
                  <dd className="min-w-0 break-words text-[15px] text-slate-700"><a href={`mailto:${site.email}`} className="font-medium hover:text-[#8A6612]">{site.email}</a></dd>
                </div>
              )}
              {site.timing && (
                <div className="flex gap-4 py-4">
                  <dt className="flex w-28 shrink-0 items-start gap-2 text-sm font-bold text-[#0B1E36]"><SiteIcon name="clock" className="mt-0.5 h-4 w-4 text-[#8A6612]" />Hours</dt>
                  <dd className="min-w-0 text-[15px] text-slate-700">{site.timing}</dd>
                </div>
              )}
            </dl>

            {enquiry.html && (
              <p className="mt-6 flex items-start gap-3 border-l-4 border-[#C59B27] bg-[#FAF7F0] p-4 text-[15px] font-medium text-[#0B1E36]">
                <SiteIcon name="shield" className="mt-0.5 h-5 w-5 shrink-0 text-[#8A6612]" />
                <span>{enquiry.html}</span>
              </p>
            )}
          </div>
          <EnquiryForm services={serviceNames} />
        </div>
      </section>
    </>
  );
}
