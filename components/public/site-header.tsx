'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SiteIcon } from '@/components/public/icons';

interface MenuLink { title: string; text: string; href: string; icon?: string; tone?: string }

/** Every entry opens its own part of the page it names (the headings carry the same ids: lib/utils/anchors.ts), so no two entries open the same place. */
const ABOUT: MenuLink[] = [
  { title: 'About NextGen', text: 'Who we are and how we work: All Compliance Under One Umbrella.', href: '/about', icon: 'compass', tone: 'bg-blue-50 text-blue-700 border-blue-100' },
  { title: 'Compliance Wing', text: 'Statutory, labour, social-security, wage and industrial-relations compliance.', href: '/about#compliance-wing', icon: 'gavel', tone: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  { title: 'Safety Wing', text: 'Industrial safety, fire and life safety, occupational health and risk management.', href: '/about#safety-wing', icon: 'hardhat', tone: 'bg-amber-50 text-amber-700 border-amber-100' },
  { title: 'Environment Wing', text: 'ESG, net zero, carbon management and environmental compliance.', href: '/about#environment-wing-sustainable-development-goals-sdgs', icon: 'leaf', tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  { title: 'Integrated Governance Approach', text: 'How the seven management dimensions fit together.', href: '/about#integrated-governance-approach', icon: 'layers', tone: 'bg-purple-50 text-purple-700 border-purple-100' },
];

const COMPLIANCE_AREAS: { title: string; href: string; icon: string; tone: string; items: [string, string][] }[] = [
  { title: 'Payroll, Compliance & IR', href: '/payroll-compliance-ir', icon: 'users', tone: 'text-blue-700', items: [
    ['Smart Workforce', '#smart-workforce'], ['Full & Final Settlement', '#full-and-final-settlement'],
    ['Wages, Working Hours & Conditions of Employment', '#wages-working-hours-conditions-of-employment'], ['Industrial Relations & Grievance Redressal', '#industrial-relations-grievance-redressal'] ] },
  { title: 'Social Security', href: '/social-security-compliance', icon: 'shield', tone: 'text-emerald-700', items: [
    ['Social Security Compliance', '#social-security-compliance'], ['What is covered', '#what-is-covered'], ['How we help', '#how-we-help'] ] },
  { title: 'Health & Safety', href: '/health-safety-compliance', icon: 'alert', tone: 'text-amber-700', items: [
    ['Industrial Safety & Occupational Health', '#industrial-safety-occupational-health'], ['Safety audit', '#safety-audit'], ['Assessments & risk engineering', '#assessments-and-risk-engineering'],
    ['Work permits', '#work-permits'], ['Reports', '#reports'] ] },
  { title: 'Environmental', href: '/environmental-compliance', icon: 'leaf', tone: 'text-teal-700', items: [
    ['ESG', '#environmental-social-governance-esg'], ['Net Zero & Climate Action', '#net-zero-climate-action'], ['Environmental Compliance & Governance', '#environmental-compliance-governance'],
    ['Audits & assessments', '#audits-and-assessments'], ['Groundwater & water', '#groundwater-and-water'], ['Returns & forms', '#returns-and-forms'], ['Corrective action', '#corrective-action'] ] },
];

const SERVICE_PAGES: MenuLink[] = [
  { title: 'Our services', text: 'Audits, assessments, studies and compliance support.', href: '/services', icon: 'briefcase', tone: 'bg-blue-50 text-blue-700 border-blue-100' },
  { title: 'Service & Global Certification', text: 'Textile standards and social-compliance programmes.', href: '/service-global-certification', icon: 'award', tone: 'bg-amber-50 text-amber-700 border-amber-100' },
  { title: 'Audit Structure', text: 'How an audit runs, from assignment to the verified report.', href: '/audit-structure', icon: 'layers', tone: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  { title: 'Compliance Calendar Guide', text: 'Staying ahead of statutory due dates.', href: '/compliance-calendar-guide', icon: 'calendar', tone: 'bg-teal-50 text-teal-700 border-teal-100' },
];

const TOOLS: MenuLink[] = [
  { title: 'Safety & Environmental Calculation', text: 'Injury rates, risk score, fire extinguisher cover, noise, power, pressure, lifting load and more.', href: '/calculators', icon: 'calculator', tone: 'bg-blue-50 text-blue-700 border-blue-100' },
  { title: 'Quotation Generation', text: 'Ask for a quotation for the audits and services you need.', href: '/quotation', icon: 'file', tone: 'bg-amber-50 text-amber-700 border-amber-100' },
  { title: 'Bill Generation', text: 'Prepare a bill for work done.', href: '/bill-generation', icon: 'clipboard', tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
];

/** The menu as the client drew it (the order matters); the drawer lists exactly these. */
const DRAWER_LINKS: [string, string][] = [
  ['HOME', '/'], ['ABOUT US', '/about'], ['PAYROLL, COMPLIANCE & IR MANAGEMENT', '/payroll-compliance-ir'], ['SOCIAL SECURITY COMPLIANCE MANAGEMENT', '/social-security-compliance'],
  ['HEALTH & SAFETY COMPLIANCE MANAGEMENT', '/health-safety-compliance'], ['ENVIRONMENTAL COMPLIANCE MANAGEMENT', '/environmental-compliance'], ['ACTS & COMPLIANCE', '/acts-compliance'],
  ['COMPLIANCE CALENDAR', '/compliance-calendar-guide'], ['AUDIT STRUCTURE', '/audit-structure'], ['SERVICE & GLOBAL CERTIFICATION', '/service-global-certification'], ['RESOURCES', '/resources'], ['REPORTS', '/reports'],
  ['TRAINING & CAPACITY BUILDING', '/training-capacity-building'], ['CONTACT US', '/contact'],
];
const TOOL_LINKS: [string, string][] = [['Safety & Environmental Calculation', '/calculators'], ['Quotation Generation', '/quotation'], ['Bill Generation', '/bill-generation']];

const NAV_BTN = 'flex items-center gap-1 text-[13px] font-bold uppercase transition-colors';
const NAV_IDLE = 'text-slate-800 hover:text-[#C59B27]';

export function SiteHeader({ phone, email }: { phone: string; email: string }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => { setDrawer(false); }, [pathname]);

  const on = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));
  const cls = (href: string) => `${NAV_BTN} ${on(href) ? 'text-[#8A6612]' : NAV_IDLE}`;
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
            <button type="button" className={`${NAV_BTN} ${COMPLIANCE_AREAS.some((area) => on(area.href)) ? 'text-[#8A6612]' : NAV_IDLE}`} aria-haspopup="true"><span>COMPLIANCE</span>{chevron}</button>
            <div className="absolute -left-40 top-full z-50 hidden pt-2 group-focus-within:block group-hover:block">
              <div className="w-[780px] whitespace-normal rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
                <div className="grid grid-cols-4 gap-5">
                  {COMPLIANCE_AREAS.map((area) => (
                    <div key={area.title} className="space-y-2">
                      <Link href={area.href} className={`flex min-h-[2.75rem] items-start gap-2 border-b border-slate-100 pb-2 text-xs font-bold uppercase leading-tight tracking-wide ${area.tone}`}>
                        <SiteIcon name={area.icon} className="h-4 w-4 shrink-0" /><span>{area.title}</span>
                      </Link>
                      <ul className="space-y-1 text-xs">
                        {area.items.map(([label, anchor]) => (<li key={anchor}><Link href={`${area.href}${anchor}`} className="block rounded px-1.5 py-1 font-medium text-slate-700 hover:bg-slate-50 hover:text-[#8A6612]">{label}</Link></li>))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <Link href="/acts-compliance" className={cls('/acts-compliance')}>ACTS &amp; COMPLIANCE</Link>
          <div className="group relative py-2">
            <Link href="/services" className={`${NAV_BTN} ${SERVICE_PAGES.some((item) => on(item.href)) ? 'text-[#8A6612]' : NAV_IDLE}`}><span>SERVICES</span>{chevron}</Link>
            <div className="absolute left-0 top-full z-50 hidden pt-2 group-focus-within:block group-hover:block">
              <div className="w-80 space-y-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
                {SERVICE_PAGES.map((item) => (
                  <Link key={item.href} href={item.href} className="group/item flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-slate-50">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${item.tone}`}><SiteIcon name={item.icon ?? 'file'} className="h-4 w-4" /></span>
                    <span>
                      <span className="block text-xs font-bold text-[#0B1E36] transition-colors group-hover/item:text-[#8A6612]">{item.title}</span>
                      <span className="block text-[11px] leading-snug text-slate-500">{item.text}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <Link href="/resources" className={cls('/resources')}>RESOURCES</Link>

          <Link href="/reports" className={cls('/reports')}>REPORTS</Link>
          <Link href="/training-capacity-building" className={cls('/training-capacity-building')}>TRAINING</Link>
          <div className="group relative py-2">
            <button type="button" className={`${NAV_BTN} ${TOOLS.some((tool) => on(tool.href)) ? 'text-[#8A6612]' : NAV_IDLE}`} aria-haspopup="true"><span>TOOLS</span>{chevron}</button>
            <div className="absolute right-0 top-full z-50 hidden pt-2 group-focus-within:block group-hover:block">
              <div className="w-80 space-y-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
                {TOOLS.map((item) => (
                  <Link key={item.href} href={item.href} className="group/item flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-slate-50">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${item.tone}`}><SiteIcon name={item.icon ?? 'file'} className="h-4 w-4" /></span>
                    <span>
                      <span className="block text-xs font-bold text-[#0B1E36] transition-colors group-hover/item:text-[#8A6612]">{item.title}</span>
                      <span className="block text-[11px] leading-snug text-slate-500">{item.text}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <Link href="/contact" className={cls('/contact')}>CONTACT US</Link>
        </nav>

        <div className="hidden shrink-0 items-center gap-3 md:flex">
          <Link href="/login" className="flex items-center gap-1.5 whitespace-nowrap rounded-md bg-[#0B2545] px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#133B5C]">
            <SiteIcon name="lock" className="h-3.5 w-3.5 text-[#C59B27]" />
            <span>LOGIN</span>
          </Link>
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

              <Link href="/login" className="flex w-full items-center justify-between rounded-lg bg-[#0B2545] p-3 text-xs font-bold text-white">
                <span>LOGIN</span><SiteIcon name="arrow" className="h-4 w-4" />
              </Link>

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
