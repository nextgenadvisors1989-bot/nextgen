import Link from 'next/link';
import type { SiteInfo } from '@/services/site.service';
import { SiteIcon } from '@/components/public/icons';
import { NewsletterForm } from '@/components/public/newsletter-form';

const QUICK_LINKS: [string, string][] = [
  ['Home', '/'], ['About Us', '/about'], ['Payroll, Compliance & IR', '/payroll-compliance-ir'], ['Social Security Compliance', '/social-security-compliance'],
  ['Health & Safety Compliance', '/health-safety-compliance'], ['Environmental Compliance', '/environmental-compliance'], ['Acts & Compliance', '/acts-compliance'],
  ['Compliance Calendar', '/compliance-calendar-guide'], ['Audit Structure', '/audit-structure'], ['Service & Global Certification', '/service-global-certification'],
  ['Services', '/services'], ['Resources & Downloads', '/resources'], ['Compliance Reports', '/reports'], ['Training & Capacity Building', '/training-capacity-building'],
  ['Safety & Environmental Calculation', '/calculators'], ['Quotation Generation', '/quotation'], ['Bill Generation', '/bill-generation'], ['Contact Us', '/contact'],
];
const HEAD = 'border-b border-slate-100 pb-1 font-mono text-xs font-bold uppercase tracking-wider text-[#0B1E36]';

/** `services` and `acts` are the same lists the home page shows (Admin -> Content -> Home page), so they are edited in one place. */
export function SiteFooter({ site, services = [], acts = [] }: { site: SiteInfo; services?: string[]; acts?: string[] }) {
  return (
    <footer className="border-t border-slate-200 bg-white text-slate-700">
      <div className="h-1 bg-[#C59B27]" />
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-4">
            <Link href="/" className="flex shrink-0 items-center py-1" aria-label="Home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo.png" alt="NextGen Socio & Enviro Advisors" className="h-14 w-auto max-w-[200px] object-contain" />
            </Link>
            <p className="text-sm font-medium leading-relaxed text-slate-600">
              NextGen Socio &amp; Enviro Advisors - Your trusted Directorate for Legal Compliance, Safety Audit (IS 14489),
              ETP/ZLD Environmental Engineering, and Global Sustainability Standards.
            </p>
            <div className="space-y-0.5 text-xs text-slate-600">
              <div>Government Registered Advisory</div>
              <div>Tamil Nadu &amp; Pan-India Practice</div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className={HEAD}>Quick Links</h4>
            <ul className="space-y-1.5 text-sm font-medium text-slate-600">
              {QUICK_LINKS.map(([label, href]) => (
                <li key={label}><Link href={href} className="transition-colors hover:text-[#C59B27]">{label}</Link></li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className={HEAD}>Our Services</h4>
            <ul className="space-y-1.5 text-sm font-medium text-slate-600">
              {services.map((label) => (
                <li key={label}><Link href="/services" className="transition-colors hover:text-[#C59B27]">{label}</Link></li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className={HEAD}>Resources &amp; Acts</h4>
            <ul className="space-y-1.5 text-sm font-medium text-slate-600">
              {acts.map((label) => (
                <li key={label}><Link href="/acts-compliance" className="transition-colors hover:text-[#C59B27]">{label}</Link></li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className={HEAD}>Contact Us</h4>
            <div className="space-y-2 text-sm font-medium text-slate-600">
              {site.address && (
                <div className="flex items-start gap-2">
                  <SiteIcon name="pin" className="mt-0.5 h-4 w-4 shrink-0 text-[#C59B27]" />
                  <span className="leading-snug">{site.address}</span>
                </div>
              )}
              {site.phone && (
                <div className="flex items-center gap-2">
                  <SiteIcon name="phone" className="h-4 w-4 shrink-0 text-[#C59B27]" />
                  <a href={`tel:${site.phone.replace(/\s/g, '')}`}>{site.phone}</a>
                </div>
              )}
              {site.phone2 && (
                <div className="flex items-center gap-2">
                  <SiteIcon name="phone" className="h-4 w-4 shrink-0 text-[#C59B27]" />
                  <a href={`tel:${site.phone2.replace(/\s/g, '')}`}>{site.phone2}</a>
                </div>
              )}
              {site.whatsapp && (
                <div className="flex items-center gap-2">
                  <SiteIcon name="phone" className="h-4 w-4 shrink-0 text-[#C59B27]" />
                  <a href={`https://wa.me/${site.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">WhatsApp us</a>
                </div>
              )}
              {site.email && (
                <div className="flex items-center gap-2">
                  <SiteIcon name="mail" className="h-4 w-4 shrink-0 text-[#C59B27]" />
                  <a href={`mailto:${site.email}`} className="break-all">{site.email}</a>
                </div>
              )}
            </div>
            <NewsletterForm />
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-8 text-sm text-slate-600 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {site.name}. All Rights Reserved. |{' '}
            <Link href="/privacy-policy" className="hover:text-[#C59B27]">Privacy Policy</Link> |{' '}
            <Link href="/terms-conditions" className="hover:text-[#C59B27]">Terms &amp; Conditions</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
