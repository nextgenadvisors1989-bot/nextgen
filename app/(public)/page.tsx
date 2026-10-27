import type { Metadata } from 'next';
import Link from 'next/link';
import { getHomeBlocks, getSiteInfo, type SiteItem } from '@/services/site.service';
import { SiteIcon } from '@/components/public/icons';
import { EnquiryForm } from '@/components/public/enquiry-form';

export const metadata: Metadata = {
  title: 'One Legal Culture - Compliance | Safety | Sustainability',
  description:
    'Legal compliance, risk management, environment, safety and sustainability solutions: statutory audits, IS 14489 safety audits, ETP/STP assessment, HAZOP, energy and water audits and global certifications.',
};

export const dynamic = 'force-dynamic';

const SERVICE_TONES = [
  'text-blue-700 bg-blue-50 border-blue-200',
  'text-amber-700 bg-amber-50 border-amber-200',
  'text-emerald-700 bg-emerald-50 border-emerald-200',
  'text-rose-700 bg-rose-50 border-rose-200',
  'text-cyan-700 bg-cyan-50 border-cyan-200',
  'text-yellow-700 bg-yellow-50 border-yellow-200',
  'text-purple-700 bg-purple-50 border-purple-200',
  'text-[#C59B27] bg-amber-50 border-amber-200',
];

const PILLAR_TONES = [
  'bg-blue-50/70 border-blue-200 text-blue-900',
  'bg-rose-50/70 border-rose-200 text-rose-900',
  'bg-emerald-50/70 border-emerald-200 text-emerald-900',
  'bg-amber-50/70 border-amber-200 text-amber-900',
  'bg-teal-50/70 border-teal-200 text-teal-900',
  'bg-indigo-50/70 border-indigo-200 text-indigo-900',
];

const GATEWAY_TONES = [
  { card: 'border-blue-200', icon: 'bg-blue-50 text-blue-700 border-blue-200', title: 'text-blue-900', button: 'bg-[#0B2545] hover:bg-[#133B5C]', arrow: 'text-amber-400' },
  { card: 'border-emerald-200', icon: 'bg-emerald-50 text-emerald-700 border-emerald-200', title: 'text-emerald-900', button: 'bg-emerald-700 hover:bg-emerald-800', arrow: 'text-white' },
  { card: 'border-amber-200', icon: 'bg-amber-50 text-amber-800 border-amber-200', title: 'text-amber-900', button: 'bg-[#C59B27] hover:bg-[#b0881e]', arrow: 'text-white' },
];

const METRIC_TONES = ['text-blue-600', 'text-emerald-600', 'text-amber-600'];

function Eyebrow({ children }: { children: string }) {
  return <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#C59B27]">{children}</span>;
}

function SectionHead({ eyebrow, title, text }: { eyebrow?: string; title: string; text?: string }) {
  return (
    <div className="mx-auto mb-10 max-w-3xl text-center">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-[#0B1E36]">{title}</h2>
      {text && <p className="mt-2 text-xs text-slate-600 sm:text-sm">{text}</p>}
    </div>
  );
}

function ItemLink({ item, className, children }: { item: SiteItem; className?: string; children: React.ReactNode }) {
  const href = item.link;
  if (!href) return <div className={className}>{children}</div>;
  if (/^https?:\/\//.test(href)) return <a href={href} target="_blank" rel="noreferrer" className={className}>{children}</a>;
  return <Link href={href} className={className}>{children}</Link>;
}

export default async function HomePage() {
  const [blocks, site] = await Promise.all([getHomeBlocks(), getSiteInfo()]);
  const { hero, gateways, pillars, services, statutory, acts, links_central, links_state, reports_grid, expertise, certifications, industries, proof, enquiry } = blocks;

  return (
    <>
      {/* ── hero: headline, metrics, the three login cards and the pillars panel ── */}
      <section className="border-b border-slate-200 bg-[#FBFBFC] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-7">
              <div>
                <h1 className="text-4xl font-extrabold tracking-tight text-[#0B1E36] sm:text-5xl">{hero.heading}</h1>
                <h2 className="mt-2 text-xl font-bold tracking-wide text-slate-800 sm:text-2xl">{hero.subheading}</h2>
                <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-slate-600 sm:text-base">{hero.html}</p>
              </div>

              <div className="flex flex-wrap gap-2.5 text-xs font-bold text-slate-700 sm:gap-3">
                {hero.items.map((item, index) => (
                  <div key={index} className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
                    <SiteIcon name={item.icon} className={`h-4 w-4 ${METRIC_TONES[index % METRIC_TONES.length]}`} />
                    <span>{item.value} {item.label}</span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-3">
                {gateways.items.slice(0, 3).map((item, index) => {
                  const tone = GATEWAY_TONES[index % GATEWAY_TONES.length];
                  return (
                    <div key={index} className={`flex flex-col justify-between space-y-3 rounded-xl border bg-white p-4 shadow-sm transition-all hover:shadow-md ${tone.card}`}>
                      <div className="space-y-2">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${tone.icon}`}><SiteIcon name={item.icon} className="h-4 w-4" /></div>
                        <h3 className={`text-xs font-bold uppercase tracking-wider ${tone.title}`}>{item.title}</h3>
                        <p className="text-[11px] leading-snug text-slate-600">{item.text}</p>
                      </div>
                      <Link href={item.link || '/login'} className={`flex w-full items-center justify-center gap-1 rounded-md py-2 text-[11px] font-bold text-white transition-colors ${tone.button}`}>
                        <span>{item.linkLabel || 'LOGIN NOW'}</span><SiteIcon name="arrow" className={`h-3 w-3 ${tone.arrow}`} />
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-center lg:col-span-5">
              <div className="relative flex w-full max-w-md flex-col items-center justify-center space-y-6 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                <div className="relative">
                  <div className="flex h-28 w-28 items-center justify-center rounded-2xl border-2 border-amber-400/40 bg-gradient-to-br from-[#0B1E36] to-[#1E3A8A] text-[#C59B27] shadow-lg">
                    <SiteIcon name="scale" className="h-14 w-14" strokeWidth={1.5} />
                  </div>
                  <div className="absolute -bottom-2 -right-2 flex h-10 w-10 items-center justify-center rounded-xl border-2 border-white bg-[#C59B27] text-white shadow-md">
                    <SiteIcon name="gavel" className="h-5 w-5" />
                  </div>
                </div>
                <div>
                  <h4 className="text-base font-extrabold text-[#0B1E36]">{pillars.heading}</h4>
                  <p className="mt-0.5 text-xs text-slate-500">{pillars.subheading}</p>
                </div>
                <div className="grid w-full grid-cols-2 gap-2.5 text-left text-xs font-bold">
                  {pillars.items.map((item, index) => (
                    <div key={index} className={`flex items-center gap-2 rounded-lg border p-2 ${PILLAR_TONES[index % PILLAR_TONES.length]}`}>
                      <SiteIcon name={item.icon} className="h-4 w-4 shrink-0" />
                      <span className="truncate text-[11px]">{item.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── core advisory services ── */}
      <section id="services" className="border-b border-slate-200 bg-white py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHead eyebrow="WHAT WE PROVIDE" title={services.heading} text={services.subheading} />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {services.items.map((item, index) => (
              <div key={index} className="group flex flex-col justify-between space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-[#C59B27]/40 hover:shadow-md">
                <div className="space-y-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-lg border ${SERVICE_TONES[index % SERVICE_TONES.length]}`}><SiteIcon name={item.icon} className="h-5 w-5" /></div>
                  <h3 className="text-base font-bold leading-snug text-[#0B1E36] transition-colors group-hover:text-[#C59B27]">{item.title}</h3>
                  <p className="text-xs font-medium leading-relaxed text-slate-600">{item.text}</p>
                </div>
                <ItemLink item={{ link: item.link || '/services' }} className="inline-flex items-center gap-1 border-t border-slate-100 pt-2 text-xs font-bold text-[#0B1E36] transition-colors group-hover:text-[#C59B27]">
                  <span>{item.linkLabel || 'Read More'}</span><SiteIcon name="arrow" className="h-3.5 w-3.5" />
                </ItemLink>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── statutory hub: acts, central links, state links, reports ── */}
      <section id="acts" className="border-y border-slate-200 bg-[#F8FAFC] py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHead eyebrow="STATUTORY & REGULATORY DIRECTORY" title={statutory.heading} text={statutory.subheading} />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            <HubBox title={acts.heading} icon="book" action={{ label: 'VIEW ALL LAWS', href: '/acts-compliance' }}>
              <div className="divide-y divide-slate-100 p-4 text-xs font-medium text-slate-700">
                {acts.items.map((item, index) => (
                  <ItemLink key={index} item={item} className="flex items-center justify-between gap-2 py-2 hover:text-[#0B1E36]">
                    <span>{item.title}</span>
                    {item.subtitle && <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{item.subtitle}</span>}
                  </ItemLink>
                ))}
              </div>
            </HubBox>

            <HubBox title={links_central.heading} icon="landmark" action={{ label: 'VIEW ALL', href: 'https://india.gov.in' }}>
              <LinkList items={links_central.items} />
            </HubBox>

            <HubBox title={links_state.heading} icon="building" action={{ label: 'VIEW ALL', href: 'https://tn.gov.in' }}>
              <LinkList items={links_state.items} />
            </HubBox>

            <HubBox title={reports_grid.heading} icon="file" action={{ label: 'VIEW ALL REPORTS', href: '/reports' }}>
              <div className="grid grid-cols-2 gap-2 p-4 text-xs font-medium text-slate-700">
                {reports_grid.items.map((item, index) => (
                  <ItemLink key={index} item={item} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center hover:bg-slate-100">
                    <span className="block text-[11px] font-bold text-[#0B1E36]">{item.title}</span>
                    <span className="text-[10px] text-slate-500">{item.subtitle}</span>
                  </ItemLink>
                ))}
              </div>
            </HubBox>
          </div>
        </div>
      </section>

      {/* ── expertise, certifications, industries ── */}
      <section className="border-b border-slate-200 bg-white py-14">
        <div className="mx-auto max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8">
          <div className="space-y-8">
            <div className="mx-auto max-w-2xl text-center">
              <Eyebrow>{expertise.subheading}</Eyebrow>
              <h3 className="mt-1 text-2xl font-extrabold tracking-tight text-[#0B1E36]">{expertise.heading}</h3>
            </div>
            <div className="rounded-2xl bg-[#0B1E36] p-6 sm:p-10">
              <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
                {expertise.items.map((item, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400"><SiteIcon name="check" className="h-4 w-4" /></div>
                    <div>
                      <h4 className="text-sm font-extrabold uppercase tracking-wide text-emerald-400">{item.title}</h4>
                      <p className="mt-1 text-xs leading-relaxed text-slate-300">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-slate-200" />

          <div className="space-y-6">
            <div className="text-center">
              <Eyebrow>{certifications.subheading}</Eyebrow>
              <h3 className="mt-1 text-2xl font-extrabold tracking-tight text-[#0B1E36]">{certifications.heading}</h3>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
              {certifications.items.map((item, index) => (
                <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-center shadow-sm transition-all hover:border-[#C59B27]">
                  <span className="block whitespace-nowrap text-xs font-extrabold text-[#0B1E36]">{item.title}</span>
                  <span className="block text-[10px] font-medium text-slate-500">{item.subtitle}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="h-px w-full bg-slate-200" />

          <div className="space-y-8">
            <div className="mx-auto max-w-2xl text-center">
              <Eyebrow>SECTORS OF EXCELLENCE</Eyebrow>
              <h3 className="mt-1 text-2xl font-extrabold tracking-tight text-[#0B1E36]">{industries.heading}</h3>
              <p className="mt-1 text-xs text-slate-600">{industries.subheading}</p>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {industries.items.map((item, index) => (
                <div key={index} className="group flex flex-col items-center space-y-2 rounded-xl border border-slate-200 bg-[#FBFBFC] p-4 text-center shadow-sm transition-all hover:border-[#C59B27]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#0B1E36] transition-colors group-hover:text-[#C59B27]"><SiteIcon name={item.icon} className="h-5 w-5" /></div>
                  <h4 className="text-xs font-bold leading-tight text-[#0B1E36] transition-colors group-hover:text-[#C59B27]">{item.title}</h4>
                  <p className="text-[10px] leading-snug text-slate-500">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── proof strip ── */}
      <section className="border-b border-slate-800 bg-[#0B1E36] py-6 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-6 text-center sm:grid-cols-3 lg:grid-cols-6">
            {proof.items.map((item, index) => (
              <div key={index} className="flex flex-col items-center space-y-1.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800/80 text-[#C59B27]"><SiteIcon name={item.icon} className="h-4 w-4" /></div>
                <div className="font-mono text-xl font-extrabold leading-none text-white sm:text-2xl">{item.value}</div>
                <div className="text-[11px] font-medium leading-tight text-slate-300">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── enquiry ── */}
      <section id="contact" className="border-b border-slate-200 bg-slate-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2">
            <div className="space-y-6">
              <div>
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-amber-600">REGULATORY ADVISORY SECRETARIAT</span>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[#0B2545] sm:text-4xl">{enquiry.heading}</h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 sm:text-sm">{enquiry.subheading}</p>
              </div>
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                {site.address && (
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100"><SiteIcon name="pin" className="h-5 w-5 text-amber-600" /></div>
                    <div className="space-y-1 text-xs text-slate-600">
                      <strong className="block text-sm font-bold text-[#0B2545]">Headquarters &amp; Advisory Secretariat:</strong>
                      <p>{site.address}</p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 text-xs sm:grid-cols-2">
                  {site.phone && <div className="flex items-center gap-2 text-slate-600"><SiteIcon name="phone" className="h-4 w-4 shrink-0 text-amber-600" /><span>{site.phone}</span></div>}
                  {site.email && <div className="flex items-center gap-2 text-slate-600"><SiteIcon name="mail" className="h-4 w-4 shrink-0 text-amber-600" /><span className="break-all">{site.email}</span></div>}
                </div>
              </div>
              {enquiry.html && (
                <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-medium text-amber-900">
                  <SiteIcon name="shield" className="h-5 w-5 shrink-0 text-amber-700" />
                  <span>{enquiry.html}</span>
                </div>
              )}
            </div>
            <EnquiryForm />
          </div>
        </div>
      </section>
    </>
  );
}

function HubBox({ title, icon, action, children }: { title: string; icon: string; action: { label: string; href: string }; children: React.ReactNode }) {
  const external = /^https?:\/\//.test(action.href);
  const button = (
    <>
      <span>{action.label}</span><SiteIcon name="arrow" className="h-3.5 w-3.5 text-[#C59B27]" />
    </>
  );
  const buttonClass = 'flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-[#0B1E36] transition-colors hover:bg-slate-100';
  return (
    <div className="flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div>
        <div className="flex items-center gap-2 border-b border-slate-800 bg-[#0B1E36] px-4 py-3">
          <SiteIcon name={icon} className="h-4 w-4 shrink-0 text-[#C59B27]" />
          <h3 className="truncate text-xs font-bold uppercase tracking-wider text-white">{title}</h3>
        </div>
        {children}
      </div>
      <div className="p-4 pt-0">
        {external ? <a href={action.href} target="_blank" rel="noreferrer" className={buttonClass}>{button}</a> : <Link href={action.href} className={buttonClass}>{button}</Link>}
      </div>
    </div>
  );
}

function LinkList({ items }: { items: SiteItem[] }) {
  return (
    <div className="divide-y divide-slate-100 p-4 text-xs font-medium text-slate-700">
      {items.map((item, index) => (
        <ItemLink key={index} item={item} className="flex items-center justify-between gap-2 py-2.5 hover:text-[#0B1E36]">
          <span>{item.title}</span>
          <SiteIcon name="external" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        </ItemLink>
      ))}
    </div>
  );
}
