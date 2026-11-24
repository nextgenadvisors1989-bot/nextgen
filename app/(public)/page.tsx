import type { Metadata } from 'next';
import Link from 'next/link';
import { getHomeBlocks, getSiteInfo, type SiteItem } from '@/services/site.service';
import { SiteIcon } from '@/components/public/icons';
import { EnquiryForm } from '@/components/public/enquiry-form';
import { HomeDirectory, type DirectoryTab } from '@/components/public/home-directory';

export const metadata: Metadata = {
  title: { absolute: 'NextGen Socio & Enviro Advisors - Compliance | Safety | Sustainability' },
  description:
    'Legal compliance, risk management, environment, safety and sustainability solutions: statutory audits, IS 14489 safety audits, ETP/STP assessment, HAZOP, energy and water audits and global certifications.',
};

export const dynamic = 'force-dynamic';

/*
 * Art direction: "a well-kept register, opened out". Navy ink and one brass accent on warm paper, a serif for the words that matter, and the principal's
 * portrait in the top banner. Sections flow into one another on soft bands (no boxes inside boxes): pill buttons and chips, large round shapes behind the
 * photo, thin rules only where a list needs them. Every word comes from the Home page editor (Admin -> Content -> Home page); nothing below is typed into
 * the code except labels of buttons that point at fixed pages of the platform.
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

function Label({ children, tone = 'light' }: { children: React.ReactNode; tone?: 'light' | 'dark' }) {
  return (
    <p className={`flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] ${tone === 'dark' ? 'text-[#E2B94A]' : 'text-[#8A6612]'}`}>
      <span aria-hidden="true" className="h-0.5 w-8 rounded-full bg-current" />
      {children}
    </p>
  );
}

const digits = (value: string) => value.replace(/\D/g, '');

export default async function HomePage() {
  const [blocks, site] = await Promise.all([getHomeBlocks(), getSiteInfo()]);
  const { hero, gateways, pillars, services, spotlight, statutory, acts, links_central, links_state, reports_grid, expertise, certifications, industries, proof, enquiry } = blocks;

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

  const initial = principalName.charAt(0).toUpperCase();
  const photoAlt = `${principalName}${spotlight.subheading ? `, ${spotlight.subheading}` : ''}`;

  return (
    <>
      {/* ── 1. the top banner: what we are, two ways in, and the principal's portrait ── */}
      <section className="relative overflow-hidden bg-[#FAF7F0]">
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-32 h-[30rem] w-[30rem] rounded-full bg-[#F2E6C4] sm:h-[40rem] sm:w-[40rem]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-8 lg:px-8 lg:pb-28 lg:pt-16">
          <div className="lg:col-span-7">
            {strapline.length > 0 && (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold uppercase tracking-[0.2em] text-[#8A6612]">
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
                  className={`inline-flex min-h-[52px] items-center gap-2 rounded-full px-7 text-[15px] font-bold transition-colors motion-reduce:transition-none ${
                    index === 0 ? 'bg-[#0B1E36] text-white shadow-lg shadow-[#0B1E36]/20 hover:bg-[#16365c]' : 'bg-white text-[#0B1E36] ring-1 ring-[#0B1E36]/25 hover:ring-[#0B1E36]'
                  }`}
                >
                  <span>{button.title}</span>
                  <SiteIcon name="arrow" className={`h-4 w-4 ${index === 0 ? 'text-[#E2B94A]' : 'text-[#8A6612]'}`} />
                </ItemLink>
              ))}
            </div>

            {pillars.items.length > 0 && !pillars.hidden && (
              <ul className="mt-10 flex flex-wrap gap-2" aria-label="What we cover">
                {pillars.items.filter((i) => i.title).map((item, index) => (
                  <li key={index} className="rounded-full bg-white/80 px-4 py-1.5 text-sm font-semibold text-[#0B1E36] ring-1 ring-[#0B1E36]/10">{item.title}</li>
                ))}
              </ul>
            )}
          </div>

          {!spotlight.hidden && (
            <figure className="relative order-first mx-auto mb-4 w-full max-w-[13.5rem] sm:max-w-xs lg:order-none lg:col-span-5 lg:mb-0 lg:max-w-md">
              <span aria-hidden="true" className="absolute -right-5 top-8 h-[92%] w-[92%] rounded-t-[999px] rounded-b-[2rem] bg-[#0B1E36]" />
              <span aria-hidden="true" className="absolute -left-4 bottom-10 h-20 w-20 rounded-full bg-[#C59B27]" />
              {spotlight.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={spotlight.imageUrl} alt={photoAlt} width={640} height={800} fetchPriority="high" decoding="async" className="relative aspect-[4/5] w-full rounded-t-[999px] rounded-b-[2rem] bg-[#E9E4D6] object-cover object-top" />
              ) : (
                <div role="img" aria-label={`${principalName} — photo to be added`} className="relative flex aspect-[4/5] w-full items-center justify-center rounded-t-[999px] rounded-b-[2rem] bg-[#0B1E36]">
                  <span className="font-display text-[8rem] font-semibold leading-none text-[#C59B27]">{initial}</span>
                </div>
              )}
              <figcaption className="absolute -bottom-6 left-3 right-3 rounded-2xl bg-white px-5 py-3.5 text-center shadow-xl shadow-[#0B1E36]/15 sm:left-auto sm:right-[-1.25rem] sm:text-left">
                <span className="block font-display text-xl font-semibold leading-tight text-[#0B1E36]">{principalName}</span>
                {spotlight.subheading && <span className="mt-0.5 block text-[13px] font-semibold text-[#8A6612]">{spotlight.subheading}</span>}
              </figcaption>
            </figure>
          )}
        </div>
      </section>

      {/* ── 2. the ways in: one bar, sitting across the edge of the banner ── */}
      {!gateways.hidden && gateways.items.length > 0 && (
        <section aria-labelledby="portal-heading" className="relative z-10 -mt-12 px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl rounded-3xl bg-white p-3 shadow-2xl shadow-[#0B1E36]/15 ring-1 ring-[#0B1E36]/5 sm:p-4">
            <div className="grid gap-2 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:items-center lg:gap-4">
              <div className="px-3 pb-1 pt-2 lg:py-0">
                <h2 id="portal-heading" className="font-display text-xl font-semibold text-[#0B1E36]">{gateways.heading}</h2>
                {gateways.subheading && <p className="mt-0.5 text-sm text-slate-600">{gateways.subheading}</p>}
              </div>
              <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-4">
                {gateways.items.filter((i) => i.title).slice(0, 4).map((item, index) => (
                  <li key={index}>
                    <ItemLink link={item.link || '/login'} className="group flex h-full items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-[#FAF7F0] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#C59B27]">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0B1E36] text-[#E2B94A]">
                        <SiteIcon name={item.icon} className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-bold text-[#0B1E36]">{item.title}</span>
                        {item.text && <span className="mt-0.5 block text-[13px] leading-snug text-slate-600">{item.text}</span>}
                      </span>
                      <SiteIcon name="arrow" className="h-4 w-4 shrink-0 text-[#8A6612] transition-transform group-hover:translate-x-0.5" />
                    </ItemLink>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* ── 3. the figures ── */}
      {!proof.hidden && proof.items.length > 0 && (
        <section aria-label="The company in figures" className="px-4 pt-16 sm:px-6 lg:px-8 lg:pt-20">
          <dl className="mx-auto flex max-w-7xl flex-wrap justify-center gap-x-14 gap-y-8 text-center">
            {proof.items.filter((i) => i.value).map((item, index) => (
              <div key={index} className="min-w-[8rem]">
                <dd className="font-display text-4xl font-semibold leading-none text-[#0B1E36] sm:text-5xl">{item.value}</dd>
                <dt className="mt-2 text-sm font-semibold text-slate-600">{item.label}</dt>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* ── 4. services ── */}
      {!services.hidden && services.items.length > 0 && (
        <section id="services" className="scroll-mt-24 py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <Label>What we do</Label>
              <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight text-[#0B1E36] sm:text-5xl">{services.heading}</h2>
              {services.subheading && <p className="mt-4 text-lg leading-relaxed text-slate-700">{services.subheading}</p>}
            </div>
            <ol className="mt-12 grid gap-x-16 gap-y-10 md:grid-cols-2">
              {services.items.filter((i) => i.title).map((item, index) => (
                <li key={index}>
                  <ItemLink link={item.link || '/services'} className="group flex gap-5 rounded-2xl p-3 transition-colors hover:bg-[#FAF7F0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C59B27] sm:-m-3">
                    <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F2E6C4] font-display text-lg font-semibold text-[#6B4F0E]">{index + 1}</span>
                    <span className="min-w-0">
                      <span className="block font-display text-xl font-semibold leading-snug text-[#0B1E36] group-hover:text-[#8A6612]">{item.title}</span>
                      {item.text && <span className="mt-1.5 block text-[15px] leading-relaxed text-slate-700">{item.text}</span>}
                      <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-[#8A6612]">
                        {item.linkLabel || 'Read more'} <SiteIcon name="arrow" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </span>
                  </ItemLink>
                </li>
              ))}
            </ol>
            <Link href="/services" className="mt-12 inline-flex min-h-[48px] items-center gap-2 rounded-full bg-[#0B1E36] px-7 text-[15px] font-bold text-white transition-colors hover:bg-[#16365c]">
              All services <SiteIcon name="arrow" className="h-4 w-4 text-[#E2B94A]" />
            </Link>
          </div>
        </section>
      )}

      {/* ── 5. the principal's message (the portrait is in the banner; the words are edited in Admin -> Content -> Home page) ── */}
      {!spotlight.hidden && (
        <section id="principal" className="scroll-mt-24 bg-[#0B1E36] py-16 text-white lg:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:gap-16 lg:px-8">
            <div className="lg:col-span-8">
              <Label tone="dark">Your point of contact</Label>
              <p className="mt-6 whitespace-pre-line font-display text-2xl leading-relaxed text-white sm:text-3xl sm:leading-relaxed">
                {spotlight.html || `Talk to ${firstName} directly about the licences, returns, audits and certifications your plant needs.`}
              </p>
              <div className="mt-8 flex items-center gap-4">
                {spotlight.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={spotlight.imageUrl} alt="" width={64} height={64} loading="lazy" decoding="async" className="h-16 w-16 shrink-0 rounded-full bg-[#E9E4D6] object-cover object-top ring-2 ring-[#C59B27]" />
                ) : (
                  <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#C59B27] font-display text-3xl font-semibold text-[#0B1E36]">{initial}</span>
                )}
                <div>
                  <p className="font-display text-xl font-semibold">{principalName}</p>
                  {spotlight.subheading && <p className="text-sm font-semibold text-[#E2B94A]">{spotlight.subheading}</p>}
                </div>
              </div>
              {spotlight.items.some((i) => i.title) && (
                <ul className="mt-6 flex flex-wrap gap-2" aria-label={`${principalName}'s credentials`}>
                  {spotlight.items.filter((i) => i.title).map((item, index) => (
                    <li key={index} className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold text-white ring-1 ring-white/20">{item.title}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-col gap-3 lg:col-span-4">
              <a href="#contact" className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-[#C59B27] px-7 text-[15px] font-bold text-[#0B1E36] transition-colors hover:bg-[#E2B94A] motion-reduce:transition-none">
                Talk to {firstName} <SiteIcon name="arrow" className="h-4 w-4" />
              </a>
              {site.phone && (
                <a href={`tel:${site.phone.replace(/[^\d+]/g, '')}`} className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full px-7 text-[15px] font-bold text-white ring-1 ring-white/40 transition-colors hover:bg-white/10 motion-reduce:transition-none">
                  <SiteIcon name="phone" className="h-4 w-4" /> {site.phone}
                </a>
              )}
              {whatsapp.length >= 10 && (
                <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full px-7 text-[15px] font-bold text-white ring-1 ring-white/40 transition-colors hover:bg-white/10 motion-reduce:transition-none">
                  WhatsApp
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── 6. the statutory directory ── */}
      {showDirectory && (
        <section id="acts" className="scroll-mt-24 bg-[#FAF7F0] py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-10 max-w-3xl">
              <Label>Statutory directory</Label>
              <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight text-[#0B1E36] sm:text-5xl">{statutory.heading}</h2>
              {statutory.subheading && <p className="mt-4 text-lg leading-relaxed text-slate-700">{statutory.subheading}</p>}
            </div>
            <HomeDirectory tabs={directoryTabs} />
          </div>
        </section>
      )}

      {/* ── 7. expertise and industries ── */}
      {((!expertise.hidden && expertise.items.length > 0) || (!industries.hidden && industries.items.length > 0)) && (
        <section id="expertise" className="scroll-mt-24 py-16 lg:py-24">
          <div className="mx-auto max-w-7xl space-y-20 px-4 sm:px-6 lg:px-8">
            {!expertise.hidden && expertise.items.length > 0 && (
              <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
                <div className="lg:col-span-4">
                  <Label>{expertise.subheading || 'Expertise'}</Label>
                  <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight text-[#0B1E36] sm:text-4xl">{expertise.heading}</h2>
                </div>
                <ul className="grid gap-x-12 gap-y-7 sm:grid-cols-2 lg:col-span-8">
                  {expertise.items.filter((i) => i.title).map((item, index) => (
                    <li key={index} className="flex gap-4">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F2E6C4] text-[#6B4F0E]"><SiteIcon name="check" className="h-4 w-4" /></span>
                      <div>
                        <h3 className="text-base font-bold text-[#0B1E36]">{item.title}</h3>
                        {item.text && <p className="mt-1 text-[15px] leading-relaxed text-slate-700">{item.text}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!industries.hidden && industries.items.length > 0 && (
              <div className="rounded-[2rem] bg-[#FAF7F0] px-6 py-12 sm:px-12">
                <div className="mb-10 max-w-3xl">
                  <h2 className="font-display text-2xl font-semibold tracking-tight text-[#0B1E36] sm:text-4xl">{industries.heading}</h2>
                  {industries.subheading && <p className="mt-3 text-lg text-slate-700">{industries.subheading}</p>}
                </div>
                <ul className="grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-5">
                  {industries.items.filter((i) => i.title).map((item, index) => (
                    <li key={index} className="flex flex-col gap-3">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0B1E36] text-[#E2B94A]"><SiteIcon name={item.icon} className="h-5 w-5" /></span>
                      <h3 className="text-base font-bold leading-snug text-[#0B1E36]">{item.title}</h3>
                      {item.text && <p className="text-sm leading-relaxed text-slate-700">{item.text}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── 8. standards and certifications ── */}
      {!certifications.hidden && certifications.items.length > 0 && (
        <section id="standards" className="scroll-mt-24 pb-16 lg:pb-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <Label>{certifications.subheading || 'Standards'}</Label>
              <h2 className="mt-4 font-display text-2xl font-semibold leading-snug tracking-tight text-[#0B1E36] sm:text-3xl">{certifications.heading}</h2>
            </div>
            <ul className="mt-8 flex flex-wrap gap-3">
              {certifications.items.filter((i) => i.title).map((item, index) => (
                <li key={index} className="rounded-full bg-white px-5 py-2.5 ring-1 ring-[#0B1E36]/15">
                  <span className="text-[15px] font-bold text-[#0B1E36]">{item.title}</span>
                  {item.subtitle && <span className="ml-2 text-sm text-slate-600">{item.subtitle}</span>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── 9. the enquiry ── */}
      <section id="contact" className="scroll-mt-24 bg-[#FAF7F0] py-16 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
          <div>
            <Label>Contact</Label>
            <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight text-[#0B1E36] sm:text-5xl">{enquiry.heading}</h2>
            {enquiry.subheading && <p className="mt-4 text-lg leading-relaxed text-slate-700">{enquiry.subheading}</p>}

            <dl className="mt-8 space-y-5">
              {site.address && (
                <div className="flex gap-4">
                  <dt className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#8A6612] ring-1 ring-[#0B1E36]/10"><SiteIcon name="pin" className="h-5 w-5" /><span className="sr-only">Address</span></dt>
                  <dd className="min-w-0 self-center text-[15px] leading-relaxed text-slate-700">{site.address}</dd>
                </div>
              )}
              {site.phone && (
                <div className="flex gap-4">
                  <dt className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#8A6612] ring-1 ring-[#0B1E36]/10"><SiteIcon name="phone" className="h-5 w-5" /><span className="sr-only">Phone</span></dt>
                  <dd className="min-w-0 self-center text-[15px] text-slate-700">
                    <a href={`tel:${site.phone.replace(/[^\d+]/g, '')}`} className="font-semibold hover:text-[#8A6612]">{site.phone}</a>
                    {site.phone2 && <> · <a href={`tel:${site.phone2.replace(/[^\d+]/g, '')}`} className="font-semibold hover:text-[#8A6612]">{site.phone2}</a></>}
                  </dd>
                </div>
              )}
              {site.email && (
                <div className="flex gap-4">
                  <dt className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#8A6612] ring-1 ring-[#0B1E36]/10"><SiteIcon name="mail" className="h-5 w-5" /><span className="sr-only">E-mail</span></dt>
                  <dd className="min-w-0 self-center break-words text-[15px] text-slate-700"><a href={`mailto:${site.email}`} className="font-semibold hover:text-[#8A6612]">{site.email}</a></dd>
                </div>
              )}
              {site.timing && (
                <div className="flex gap-4">
                  <dt className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#8A6612] ring-1 ring-[#0B1E36]/10"><SiteIcon name="clock" className="h-5 w-5" /><span className="sr-only">Hours</span></dt>
                  <dd className="min-w-0 self-center text-[15px] text-slate-700">{site.timing}</dd>
                </div>
              )}
            </dl>

            {enquiry.html && (
              <p className="mt-8 flex items-start gap-3 rounded-2xl bg-white p-5 text-[15px] font-medium text-[#0B1E36] ring-1 ring-[#C59B27]/50">
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
