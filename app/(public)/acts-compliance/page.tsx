import type { Metadata } from 'next';
import Link from 'next/link';
import { listPublicActs, listActStates } from '@/services/public.service';
import { formatDate } from '@/lib/utils/dates';

export const metadata: Metadata = {
  title: 'Acts & Compliance',
  description: 'Central and state labour legislation with applicability criteria, summaries and official sources.',
};

export const dynamic = 'force-dynamic';

export default async function ActsCompliancePage({
  searchParams,
}: { searchParams: Promise<{ search?: string; state?: string }> }) {
  const params = await searchParams;
  const [acts, states] = await Promise.all([
    listPublicActs({ search: params.search, state: params.state }),
    listActStates(),
  ]);

  return (
    <>
      <section className="border-b border-line bg-surface-muted py-14">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <h1 className="text-4xl font-bold text-ink">Acts &amp; Compliance</h1>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-muted">
            The legislation we map against each establishment, with the applicability criteria we use to decide
            which obligations apply to you.
          </p>

          <form method="get" className="mt-8 flex flex-col gap-3 sm:flex-row">
            <input
              type="search" name="search" defaultValue={params.search ?? ''}
              placeholder="Search by act name, number or subject…"
              className="focus-ring w-full rounded-lg border border-line px-4 py-2.5 text-sm"
              aria-label="Search acts"
            />
            <select name="state" defaultValue={params.state ?? 'all'} aria-label="Filter by state"
              className="focus-ring rounded-lg border border-line px-4 py-2.5 text-sm">
              <option value="all">All jurisdictions</option>
              {states.map((state) => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
            <button type="submit" className="rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-600">
              Search
            </button>
          </form>
        </div>
      </section>

      <section className="py-14">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <p className="mb-6 text-sm text-ink-muted">{acts.length} act(s) listed</p>

          {acts.length === 0 ? (
            <div className="rounded-xl border border-line p-10 text-center">
              <p className="text-lg font-semibold text-ink">No acts match your search</p>
              <p className="mx-auto mt-2 max-w-lg text-sm text-ink-muted">
                Try a broader term, or clear the filters to see the full library. If you need an act that is not
                listed yet, write to us and we will map it for your establishment.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Link href="/acts-compliance" className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface-muted">
                  Clear filters
                </Link>
                <Link href="/contact" className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600">
                  Request an Act
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {acts.map((act) => (
                <article key={String(act.id)} className="flex flex-col rounded-xl border border-line p-6">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-semibold text-ink">{String(act.short_name ?? act.act_name)}</h2>
                    <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                      {String(act.jurisdiction ?? 'Central')}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">{String(act.act_name)}</p>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-ink-muted">Act number</dt>
                      <dd className="text-ink-soft">{String(act.act_number ?? '—')} of {String(act.act_year ?? '—')}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-ink-muted">State</dt>
                      <dd className="text-ink-soft">{String(act.state_name ?? 'All India')}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-ink-muted">Ministry</dt>
                      <dd className="text-ink-soft">{String(act.ministry ?? '—')}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-ink-muted">Last amended</dt>
                      <dd className="text-ink-soft">{formatDate(act.last_amended_date as string | null)}</dd>
                    </div>
                  </dl>

                  {act.summary && <p className="mt-4 text-sm leading-relaxed text-ink-muted">{String(act.summary)}</p>}

                  {act.applicability_criteria && (
                    <p className="mt-4 rounded-lg bg-surface-muted px-3 py-2 text-xs leading-relaxed text-ink-soft">
                      <span className="font-semibold">Applicability:</span> {String(act.applicability_criteria)}
                    </p>
                  )}

                  {act.official_source_url && (
                    <a href={String(act.official_source_url)} target="_blank" rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
                      Official source
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M7 17 17 7M7 7h10v10" />
                      </svg>
                    </a>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
