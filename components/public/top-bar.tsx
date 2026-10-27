import type { SiteInfo } from '@/services/site.service';
import { SiteIcon, SocialIcon } from '@/components/public/icons';

const SOCIALS = ['facebook', 'linkedin', 'twitter', 'instagram', 'youtube'] as const;

/** The three tools the client wants one click from every page. */
const TOOLS: [string, string][] = [['Safety & Environmental Calculation', '/calculators'], ['Quotation Generation', '/quotation'], ['Bill Generation', '/bill-generation']];

/** The dark utility strip above the header: phone, email, working hours and social links. */
export function TopBar({ site }: { site: SiteInfo }) {
  const socials = SOCIALS.filter((name) => site.social[name]);
  return (
    <div className="border-b border-slate-800 bg-[#0B1E36] py-2 text-xs text-slate-200">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 overflow-hidden whitespace-nowrap px-4 lg:px-8">
        <div className="flex items-center gap-5 text-slate-300">
          {site.phone && (
            <a href={`tel:${site.phone.replace(/\s/g, '')}`} className="flex items-center gap-2">
              <SiteIcon name="phone" className="h-3.5 w-3.5 shrink-0 text-[#C59B27]" />
              <span>Phone: <strong className="text-white">{site.phone}</strong></span>
            </a>
          )}
          {site.email && (
            <>
              <span className="hidden text-slate-600 sm:inline">•</span>
              <a href={`mailto:${site.email}`} className="hidden items-center gap-2 sm:flex">
                <SiteIcon name="mail" className="h-3.5 w-3.5 shrink-0 text-[#C59B27]" />
                <span>Email: <strong className="text-white">{site.email}</strong></span>
              </a>
            </>
          )}
          {site.timing && (
            <>
              <span className="hidden text-slate-600 md:inline lg:hidden">•</span>
              <span className="hidden items-center gap-2 md:flex lg:hidden">
                <SiteIcon name="clock" className="h-3.5 w-3.5 shrink-0 text-[#C59B27]" />
                <span>Timing: <strong className="text-white">{site.timing}</strong></span>
              </span>
            </>
          )}
        </div>

        <nav aria-label="Tools" className="hidden items-center gap-2 lg:flex">
          {TOOLS.map(([label, href]) => (
            <a key={href} href={href} className="rounded-full border border-[#C59B27]/60 px-3 py-0.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#C59B27] hover:text-[#0B1E36]">{label}</a>
          ))}
        </nav>

        {socials.length > 0 && (
          <div className="flex items-center gap-3 pl-4 text-slate-300">
            <span className="hidden font-medium text-slate-400 sm:inline lg:hidden">Follow Us:</span>
            <div className="flex items-center gap-2.5">
              {socials.map((name) => (
                <a
                  key={name}
                  href={site.social[name]}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={name}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition-colors hover:bg-[#C59B27] hover:text-white"
                >
                  <SocialIcon name={name} />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
