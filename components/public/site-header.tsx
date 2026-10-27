'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { SiteIcon } from '@/components/public/icons';

interface MenuLink { title: string; text: string; href: string; icon?: string; tone?: string }

const ABOUT: MenuLink[] = [
  { title: 'Overview & Vision', text: 'Our journey in environmental stewardship & statutory compliance.', href: '/about', icon: 'compass', tone: 'bg-blue-50 text-blue-700 border-blue-100' },
  { title: 'Our Leadership & Experts', text: 'Certified EHS auditors, legal advocates & chartered engineers.', href: '/about', icon: 'award', tone: 'bg-amber-50 text-amber-700 border-amber-100' },
  { title: 'Empanelment & Accreditations', text: 'Recognized by industrial federations & certification bodies.', href: '/about', icon: 'shield', tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  { title: 'Why Choose Us', text: '15+ years of zero-penalty compliance track record.', href: '/about', icon: 'star', tone: 'bg-purple-50 text-purple-700 border-purple-100' },
];

const ACTS_CENTRAL: [string, string][] = [
  ['Factories Act 1948 & Model Rules', 'Working hours, health, welfare & leave records.'],
  ['Environment (Protection) Act 1986', 'Comprehensive framework for environmental standards.'],
  ['Water Act 1974 & Air Act 1981', 'Consent management & CPCB emissions standards.'],
  ['Hazardous & Other Wastes Rules 2016', 'TSDF authorization, manifest Form 10 & disposal.'],
  ['Plastic & E-Waste Management Rules 2022', 'EPR registration and statutory recycling targets.'],
];
const ACTS_STATE: [string, string][] = [
  ['TN Factories Rules 1950 (Forms 10, 21, 25)', 'Overtime register, accident reporting & muster rolls.'],
  ['TNPCB Consent to Establish (CTE) & CTO', 'Red category renewal, ZLD compliance & testing.'],
  ['DISH Safety Directives & Pressure Vessel', 'Form 8 boiler/vessel inspection & factory licenses.'],
  ['TN Fire & Rescue Services Rules & NOC', 'Hydrant system verification & emergency evacuation.'],
];

const SERVICE_COLUMNS: { title: string; icon: string; tone: string; items: [string, string][] }[] = [
  {
    title: 'Environmental & Utilities', icon: 'droplet', tone: 'text-emerald-700',
    items: [
      ['ETP, STP & ZLD Optimization', 'Zero Liquid Discharge & RO recovery validation.'],
      ['Daily Water Balance & NOC', 'Groundwater extraction NOC & daily meter logs.'],
      ['Waste Management & TSDF', 'Hazardous waste manifest & CPCB annual returns.'],
    ],
  },
  {
    title: 'Safety & Statutory Audits', icon: 'shield', tone: 'text-amber-700',
    items: [
      ['Safety Audit (IS 14489:2018)', '12-Element comprehensive occupational safety audit.'],
      ['Process Hazard (HAZOP & HIRA)', 'Quantitative risk assessment & control engineering.'],
      ['Legal Compliance Registers', 'Central & TN State statutory registers maintenance.'],
    ],
  },
  {
    title: 'Sustainability & Brands', icon: 'leaf', tone: 'text-blue-700',
    items: [
      ['GHG Protocol (Scope 1, 2, 3)', 'ISO 14064 corporate carbon footprint & SBTi targets.'],
      ['Textile Exchange (GOTS, GRS)', 'OCS, RCS, RWS chain of custody & F422 forms.'],
      ['Social (Sedex SMETA, WRAP)', '4-Pillar SMETA, SA8000 & POSH compliance.'],
      ['ZDHC MRSL & ChemCheck', 'Chemical inventory Level 3 conformity log.'],
    ],
  },
];

const RESOURCES: MenuLink[] = [
  { title: 'Statutory Compliance Calendar ★', text: '12-Month matrix, renewal deadlines & 45+ licences hub.', href: '/compliance-calendar-guide', icon: 'calendar', tone: 'bg-teal-50 text-teal-700 border-teal-100' },
  { title: 'Gazette Notifications & Orders', text: 'Download latest government circulars & rules.', href: '/resources', icon: 'file', tone: 'bg-blue-50 text-blue-700 border-blue-100' },
  { title: 'Audit Checklists & Formats', text: 'Free statutory registers & CAPA templates.', href: '/resources', icon: 'checksquare', tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  { title: 'Knowledge Base & FAQs', text: 'Industrial compliance guidelines & expert answers.', href: '/faq', icon: 'book', tone: 'bg-amber-50 text-amber-700 border-amber-100' },
];

const COMPLIANCE_AREAS: { title: string; href: string; icon: string; tone: string; items: string[] }[] = [
  { title: 'Payroll, Compliance & IR', href: '/payroll-compliance-ir', icon: 'users', tone: 'text-blue-700', items: ['Smart Workforce', 'Full & Final Settlement', 'Grievance Redressal', 'Strikes & Lockouts', 'Layoff & Retrenchment', 'Standing Orders'] },
  { title: 'Social Security', href: '/social-security-compliance', icon: 'shield', tone: 'text-emerald-700', items: ['Provident Fund (EPF)', 'ESI', 'Bonus', 'Gratuity', 'Welfare Fund & Professional Tax'] },
  { title: 'Health & Safety', href: '/health-safety-compliance', icon: 'alert', tone: 'text-amber-700', items: ['Safety Audit (IS 14489)', 'Assessment', 'Risk Engineering', 'Work Permits', 'Reports'] },
  { title: 'Environmental', href: '/environmental-compliance', icon: 'leaf', tone: 'text-teal-700', items: ['Environmental Audit & Assessment', 'Groundwater NOC', 'Returns & Forms', 'Reports'] },
];

/** The menu as the client drew it (the order matters); the drawer lists exactly these. */
const DRAWER_LINKS: [string, string][] = [
  ['HOME', '/'], ['ABOUT US', '/about'], ['PAYROLL, COMPLIANCE & IR MANAGEMENT', '/payroll-compliance-ir'], ['SOCIAL SECURITY COMPLIANCE MANAGEMENT', '/social-security-compliance'],
  ['HEALTH & SAFETY COMPLIANCE MANAGEMENT', '/health-safety-compliance'], ['ENVIRONMENTAL COMPLIANCE MANAGEMENT', '/environmental-compliance'], ['ACTS & COMPLIANCE', '/acts-compliance'],
  ['COMPLIANCE CALENDAR', '/compliance-calendar-guide'], ['AUDIT STRUCTURE', '/audit-structure'], ['SERVICE & GLOBAL CERTIFICATION', '/service-global-certification'], ['RESOURCES', '/resources'], ['REPORTS', '/reports'],
  ['TRAINING & CAPACITY BUILDING', '/training-capacity-building'], ['CONTACT US', '/contact'],
];
const TOOL_LINKS: [string, string][] = [['Safety & Environmental Calculation', '/calculators'], ['Quotation Generation', '/quotation'], ['Bill Generation', '/bill-generation']];

const LOGIN_PORTALS = [
  { label: 'Client Portal', icon: 'building', tone: 'text-blue-600' },
  { label: 'Employee / Auditor Portal', icon: 'user-check', tone: 'text-amber-600' },
  { label: 'Admin Portal', icon: 'shield', tone: 'text-emerald-600' },
];

const NAV_BTN = 'flex items-center gap-1 text-[13px] font-bold uppercase transition-colors';
const NAV_IDLE = 'text-slate-800 hover:text-[#C59B27]';

export function SiteHeader({ phone, email }: { phone: string; email: string }) {
  const pathname = usePathname();
  const [loginOpen, setLoginOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [accordion, setAccordion] = useState<string | null>(null);
  const loginRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDrawer(false); setLoginOpen(false); }, [pathname]);
  useEffect(() => {
    function away(event: MouseEvent) {
      if (loginRef.current && !loginRef.current.contains(event.target as Node)) setLoginOpen(false);
    }
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const on = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));
  const cls = (href: string) => `${NAV_BTN} ${on(href) ? 'text-[#C59B27]' : NAV_IDLE}`;
  const chevron = <SiteIcon name="chevron" className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-hover:rotate-180" />;

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white py-3 shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center py-1" aria-label="Home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.png" alt="NextGen Socio & Enviro Advisors" className="h-12 w-auto max-w-[200px] object-contain transition-transform duration-200 hover:scale-105 sm:h-14 md:h-16" />
        </Link>

        <nav className="hidden items-center gap-3 whitespace-nowrap xl:flex 2xl:gap-6">
          <Link href="/" className={cls('/')}>HOME</Link>

          <div className="group relative py-2">
            <Link href="/about" className={cls('/about')}><span>ABOUT US</span>{chevron}</Link>
            <div className="absolute left-0 top-full z-50 hidden pt-2 group-hover:block">
              <div className="w-80 space-y-1 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl">
                {ABOUT.map((item) => (
                  <Link key={item.title} href={item.href} className="group/item flex items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-slate-50">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${item.tone}`}><SiteIcon name={item.icon} className="h-4 w-4" /></span>
                    <span>
                      <span className="block text-xs font-bold text-[#0B1E36] transition-colors group-hover/item:text-[#C59B27]">{item.title}</span>
                      <span className="block text-[11px] leading-snug text-slate-500">{item.text}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="group relative py-2">
            <button type="button" className={`${NAV_BTN} ${COMPLIANCE_AREAS.some((a) => on(a.href)) ? 'text-[#C59B27]' : NAV_IDLE}`} aria-haspopup="true"><span>COMPLIANCE</span>{chevron}</button>
            <div className="absolute -left-40 top-full z-50 hidden pt-2 group-focus-within:block group-hover:block">
              <div className="w-[760px] whitespace-normal rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
                <div className="grid grid-cols-4 gap-5">
                  {COMPLIANCE_AREAS.map((area) => (
                    <div key={area.title} className="space-y-2">
                      <Link href={area.href} className={`flex min-h-[2.75rem] items-start gap-2 border-b border-slate-100 pb-2 text-xs font-bold uppercase leading-tight tracking-wide ${area.tone}`}>
                        <SiteIcon name={area.icon} className="h-4 w-4 shrink-0" /><span>{area.title}</span>
                      </Link>
                      <ul className="space-y-1 text-xs">
                        {area.items.map((item) => (<li key={item}><Link href={area.href} className="block rounded px-1.5 py-1 font-medium text-slate-700 hover:bg-slate-50 hover:text-[#C59B27]">{item}</Link></li>))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="group relative py-2">
            <Link href="/acts-compliance" className={cls('/acts-compliance')}><span>ACTS &amp; COMPLIANCE</span>{chevron}</Link>
            <div className="absolute -left-20 top-full z-50 hidden pt-2 group-hover:block">
              <div className="w-[660px] rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
                <div className="grid grid-cols-2 gap-6">
                  {[
                    { title: 'Central Government Acts', icon: 'landmark', list: ACTS_CENTRAL },
                    { title: 'State Regulations (Tamil Nadu)', icon: 'shield', list: ACTS_STATE },
                  ].map((column) => (
                    <div key={column.title} className="space-y-3">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                        <SiteIcon name={column.icon} className="h-4 w-4 text-blue-700" />
                        <span className="text-xs font-bold uppercase tracking-wider text-[#0B1E36]">{column.title}</span>
                      </div>
                      <div className="space-y-1 text-xs">
                        {column.list.map(([title, text]) => (
                          <Link key={title} href="/acts-compliance" className="block rounded-lg p-2 hover:bg-slate-50">
                            <span className="block font-bold text-slate-800 hover:text-[#C59B27]">{title}</span>
                            <span className="block text-[11px] text-slate-500">{text}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <Link href="/audit-structure" className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 p-3 text-xs font-bold text-[#0B1E36] transition-all hover:border-[#C59B27]"><span>Audit Structure</span><span aria-hidden>→</span></Link>
                <Link href="/compliance-calendar-guide" className="mt-3 flex items-center justify-between rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50/70 to-blue-50/70 p-3 transition-all hover:border-[#C59B27]">
                  <span className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B1E36] text-[#C59B27]"><SiteIcon name="calendar" className="h-4 w-4" /></span>
                    <span>
                      <span className="block text-xs font-bold text-[#0B1E36]">Master Statutory Compliance Calendar &amp; 45+ Legal Licences Hub ★</span>
                      <span className="block text-[11px] text-slate-500">12-Month matrix for TNPCB, DISH, EPFO, ESIC &amp; Fire NOC renewals.</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-xs font-bold text-[#0B1E36]">Open Calendar <SiteIcon name="arrow" className="h-3.5 w-3.5" /></span>
                </Link>
              </div>
            </div>
          </div>

          <div className="group relative py-2">
            <Link href="/services" className={cls('/services')}><span>SERVICES</span>{chevron}</Link>
            <div className="absolute left-1/2 top-full z-[999] hidden w-[95vw] max-w-6xl -translate-x-1/2 pt-3 group-hover:block">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(8,112,184,0.15)]">
                <div className="grid grid-cols-3 gap-8 p-8">
                  {SERVICE_COLUMNS.map((column) => (
                    <div key={column.title} className="space-y-4">
                      <div className={`flex items-center gap-2 border-b border-slate-100 pb-2 text-xs font-bold uppercase tracking-wider ${column.tone}`}>
                        <SiteIcon name={column.icon} className="h-4 w-4" /><span>{column.title}</span>
                      </div>
                      <div className="space-y-3">
                        {column.items.map(([title, text]) => (
                          <Link key={title} href="/services" className="group/item block rounded-lg p-2 transition-colors hover:bg-slate-50">
                            <span className="block text-sm font-bold text-slate-800 group-hover/item:text-[#0B2545]">{title}</span>
                            <span className="mt-0.5 block text-xs text-slate-500">{text}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 bg-slate-50 px-8 py-4">
                  <Link href="/services" className="group/bot flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B2545] text-xs font-bold text-white">HR</span>
                    <span>
                      <span className="block text-xs font-bold text-slate-900 group-hover/bot:text-amber-600">Smart Workforce Suite →</span>
                      <span className="block text-[11px] text-slate-500">Digital ID cards, Shift &amp; OT engine</span>
                    </span>
                  </Link>
                  <Link href="/services" className="group/bot flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-700 text-xs font-bold text-white">F&amp;F</span>
                    <span>
                      <span className="block text-xs font-bold text-slate-900 group-hover/bot:text-emerald-600">Full &amp; Final Settlement ★ →</span>
                      <span className="block text-[11px] text-slate-500">Gratuity 1972 &amp; Relieving letter generator</span>
                    </span>
                  </Link>
                  <Link href="/calculators" className="flex items-center gap-1 text-xs font-bold text-[#0B2545] hover:text-amber-600">Calculators &amp; Estimators <span>→</span></Link>
                </div>
              </div>
            </div>
          </div>

          <div className="group relative py-2">
            <Link href="/resources" className={cls('/resources')}><span>RESOURCES</span>{chevron}</Link>
            <div className="absolute left-0 top-full z-50 hidden pt-2 group-hover:block">
              <div className="w-80 space-y-1 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl">
                {RESOURCES.map((item) => (
                  <Link key={item.title} href={item.href} className="group/item flex items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-slate-50">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${item.tone}`}><SiteIcon name={item.icon} className="h-4 w-4" /></span>
                    <span>
                      <span className="block text-xs font-bold text-[#0B1E36] transition-colors group-hover/item:text-[#C59B27]">{item.title}</span>
                      <span className="block text-[11px] leading-snug text-slate-500">{item.text}</span>
                    </span>
                  </Link>
                ))}
                <Link href="/calculators" className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50/70 p-2.5 transition-colors hover:bg-blue-100/70">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0B1E36] text-[#C59B27]"><SiteIcon name="calculator" className="h-4 w-4" /></span>
                  <span>
                    <span className="block text-xs font-bold text-[#0B1E36]">Safety &amp; Environmental Calculation ★</span>
                    <span className="block text-[11px] leading-snug text-slate-600">Injury rates, risk score, emissions, effluent load, EPF, ESI, gratuity &amp; bonus.</span>
                  </span>
                </Link>
              </div>
            </div>
          </div>

          <Link href="/reports" className={cls('/reports')}>REPORTS</Link>
          <Link href="/training-capacity-building" className={cls('/training-capacity-building')}>TRAINING</Link>
          <Link href="/contact" className={cls('/contact')}>CONTACT US</Link>
        </nav>

        <div className="hidden shrink-0 items-center gap-3 md:flex">
          <div className="relative" ref={loginRef}>
            <button
              type="button"
              onClick={() => setLoginOpen((open) => !open)}
              aria-expanded={loginOpen}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-md bg-[#0B2545] px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#133B5C]"
            >
              <SiteIcon name="lock" className="h-3.5 w-3.5 text-[#C59B27]" />
              <span>LOGIN</span>
              <SiteIcon name="chevron" className="ml-0.5 h-3.5 w-3.5 text-slate-300" />
            </button>
            {loginOpen && (
              <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                <div className="border-b border-slate-100 px-3 py-1.5 font-mono text-[10px] font-bold uppercase text-slate-400">Select Portal Gateway</div>
                <div className="space-y-1 p-1 text-xs">
                  {LOGIN_PORTALS.map((portal) => (
                    <Link key={portal.label} href="/login" className="flex items-center gap-2.5 rounded-lg p-2 font-bold text-slate-800 hover:bg-slate-50">
                      <SiteIcon name={portal.icon} className={`h-4 w-4 ${portal.tone}`} />
                      <span>{portal.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
          <Link href="/contact" className="hidden whitespace-nowrap rounded-md bg-[#C59B27] 2xl:inline-block px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#b0881e]">REQUEST QUOTE</Link>
        </div>

        <button type="button" onClick={() => setDrawer(true)} aria-label="Open navigation menu" className="rounded-lg p-2 text-[#0B1E36] transition-colors hover:bg-slate-100 xl:hidden">
          <SiteIcon name="menu" className="h-6 w-6" />
        </button>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <div className="fixed inset-y-0 right-0 z-50 flex w-[320px] max-w-[88vw] flex-col justify-between overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/logo.png" alt="NextGen Socio & Enviro Advisors" className="h-10 w-auto max-w-[170px] object-contain" />
                <button type="button" onClick={() => setDrawer(false)} aria-label="Close menu" className="p-1 text-slate-400 hover:text-slate-700"><SiteIcon name="close" className="h-5 w-5" /></button>
              </div>

              <div className="space-y-2">
                <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">PORTAL LOGIN GATEWAYS</div>
                {[
                  ['Customer / Client Portal', 'bg-blue-50 text-blue-900'],
                  ['Employee / Auditor Portal', 'bg-green-50 text-green-900'],
                  ['Admin Portal', 'bg-slate-100 text-slate-900'],
                ].map(([label, tone]) => (
                  <Link key={label} href="/login" className={`flex w-full items-center justify-between rounded-lg p-2.5 text-xs font-bold ${tone}`}>
                    <span>{label}</span><SiteIcon name="arrow" className="h-4 w-4" />
                  </Link>
                ))}
              </div>

              <div className="space-y-1 border-t border-slate-100 pt-2">
                {DRAWER_LINKS.map(([label, href]) => (
                  <div key={href}>
                    <Link href={href} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50">
                      <span>{label}</span><SiteIcon name="arrow" className="h-3.5 w-3.5 text-slate-400" />
                    </Link>
                  </div>
                ))}
                <div className="pt-2 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">TOOLS</div>
                {TOOL_LINKS.map(([label, href]) => (
                  <Link key={href} href={href} className="flex w-full items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-[#0B1E36] hover:bg-amber-100">
                    <span>{label}</span><SiteIcon name="arrow" className="h-3.5 w-3.5 text-slate-400" />
                  </Link>
                ))}
                <button type="button" onClick={() => setAccordion(accordion === 'svc' ? null : 'svc')} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50">
                  <span>SERVICES AT A GLANCE</span>
                  <SiteIcon name="chevron" className={`h-3.5 w-3.5 text-slate-400 transition-transform ${accordion === 'svc' ? 'rotate-180' : ''}`} />
                </button>
                {accordion === 'svc' && (
                  <div className="space-y-1 rounded-lg bg-slate-50 py-1 pl-4 pr-2 text-[11px] text-slate-600">
                    {SERVICE_COLUMNS.flatMap((column) => column.items).map(([title]) => (
                      <Link key={title} href="/services" className="block py-1.5 hover:text-[#C59B27]">{title}</Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 border-t border-slate-100 pt-4">
              <Link href="/contact" className="block w-full rounded-md bg-[#C59B27] py-2.5 text-center text-xs font-bold text-white shadow-sm">REQUEST QUOTE</Link>
              <div className="space-y-1 text-[11px] text-slate-500">
                {phone && <div>Phone: {phone}</div>}
                {email && <div>{email}</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
