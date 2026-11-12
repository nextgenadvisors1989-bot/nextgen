/**
 * Reads one Act: the Arrangement of Sections (the contents), one chapter or schedule at a time with every section, its sub sections and its amendment notes, and a
 * search inside the Act. Rendered on the server for the public website (/acts-compliance/[id]) and the auditor panel; the text is the sanitised HTML of the Act builder.
 */
import Link from 'next/link';
import type { ReaderData, ReaderPart, ReaderProvision } from '@/types/acts';

const partLabel = (part: ReaderPart) => (part.kind === 'Act' ? part.title : [part.kind === 'Chapter' ? `CHAPTER ${part.number ?? ''}`.trim() : part.number, part.title].filter(Boolean).join(' - '));
const sectionLabel = (s: { number: string | null; title: string }) => `${s.number ? `${s.number}. ` : ''}${s.title}`;

function Body({ p }: { p: ReaderProvision }) {
  if (p.status !== 'active') return null;
  if (p.body_html) return <div className="act-prose mt-2" dangerouslySetInnerHTML={{ __html: p.body_html }} />;
  if (p.explanation) return <p className="mt-2 whitespace-pre-line leading-relaxed text-ink-soft">{p.explanation}</p>;
  return null;
}

function Notes({ p }: { p: ReaderProvision }) {
  if (!p.amendments.length) return null;
  return (
    <ol className="mt-3 space-y-1 border-t border-dashed border-line pt-3 text-xs leading-relaxed text-ink-muted" aria-label="Amendments">
      {p.amendments.map((a, i) => (
        <li key={i}>{a.reference ? <sup className="mr-1 font-semibold">{a.reference}</sup> : null}{[a.amended_on, a.description].filter(Boolean).join(' - ')}</li>
      ))}
    </ol>
  );
}

function StatusChip({ status }: { status: string }) {
  if (status === 'active') return null;
  return <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 align-middle text-xs font-medium capitalize text-ink-muted">{status}</span>;
}

function Section({ p }: { p: ReaderProvision }) {
  return (
    <section id={`s-${p.id}`} className="scroll-mt-24 border-b border-line py-5 last:border-b-0">
      <h3 className="text-base font-semibold leading-snug text-ink">
        {p.number ? <span className="mr-1.5">{p.number}.</span> : null}{p.title}<StatusChip status={p.status} />
      </h3>
      <Body p={p} />
      {p.status === 'active' && p.children.map((c) => (
        <div key={c.id} id={`s-${c.id}`} className="mt-3 flex scroll-mt-24 gap-3">
          <span className="w-9 shrink-0 text-right font-semibold text-ink">{c.number}</span>
          <div className="min-w-0 flex-1">
            {c.body_html || c.explanation ? <Body p={c} /> : <p className="text-ink-soft">{c.title}</p>}
            <Notes p={c} />
          </div>
        </div>
      ))}
      <Notes p={p} />
    </section>
  );
}

function Contents({ data, basePath, activeId }: { data: ReaderData; basePath: string; activeId: number | null }) {
  return (
    <ul className="space-y-0.5 text-sm">
      {data.parts.map((part) => {
        const active = part.id === activeId;
        return (
          <li key={part.id}>
            <Link href={`${basePath}?part=${part.id}`} aria-current={active ? 'true' : undefined}
              className={`block rounded-md px-2.5 py-1.5 leading-snug transition-colors hover:bg-surface-muted ${active ? 'bg-brand-50 font-semibold text-ink' : 'text-ink-soft'}`}>
              {partLabel(part)}
            </Link>
            {active && part.sections.length > 0 && (
              <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-line pl-2 text-xs">
                {part.sections.map((s) => (
                  <li key={s.id}><a href={`#s-${s.id}`} className="block rounded px-1.5 py-1 leading-snug text-ink-muted hover:text-brand-600">{sectionLabel(s)}</a></li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ActReader({ data, basePath, view = 'part' }: { data: ReaderData; basePath: string; view?: 'part' | 'arrangement' }) {
  const { act, selected } = data;
  // the number may already read "63 of 1948" (as typed in the register)
  const number = act.act_number ? (/\bof\b/i.test(act.act_number) || !act.act_year ? act.act_number : `${act.act_number} of ${act.act_year}`) : null;
  const meta = [
    number ? (/^G\.?\s?O/i.test(number) ? number : `Act ${number}`) : act.act_year ? String(act.act_year) : null,
    act.state_name ?? act.jurisdiction, act.ministry, act.last_amended_date ? `Last amended ${act.last_amended_date}` : null,
  ].filter(Boolean);
  const searching = data.hits !== null;
  const unit = /\brules\b/i.test(act.act_name) ? 'rules' : 'sections';

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {meta.join(' · ')}{meta.length ? ' · ' : ''}{data.totals.parts > 0 ? `${data.totals.parts} chapters and schedules, ` : ''}{data.totals.sections} {unit}
        </p>
        <div className="no-print flex flex-wrap items-center gap-2">
          <Link href={view === 'arrangement' ? basePath : `${basePath}?view=arrangement`} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface-muted">
            {view === 'arrangement' ? (unit === 'rules' ? 'Read the Rules' : 'Read the Act') : (unit === 'rules' ? 'Arrangement of Rules' : 'Arrangement of Sections')}
          </Link>
          {act.official_source_url && (
            <a href={act.official_source_url} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-brand-600 transition-colors hover:bg-surface-muted">Official source</a>
          )}
        </div>
      </div>

      <form method="get" action={basePath} role="search" className="no-print mb-6 flex gap-2">
        <input type="search" name="q" defaultValue={data.query} placeholder={`Search this ${unit === 'rules' ? 'set of Rules' : 'Act'}: a ${unit === 'rules' ? 'rule' : 'section'} number, a heading or a word`} aria-label="Search this Act"
          className="focus-ring w-full rounded-lg border border-line px-4 py-2 text-sm" />
        <button type="submit" className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600">Search</button>
      </form>

      {searching ? (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink">{data.hits!.length ? `${data.hits!.length}${data.hits!.length === 60 ? '+' : ''} result(s) for "${data.query}"` : `Nothing found for "${data.query}"`}</h2>
            <Link href={basePath} className="text-sm font-semibold text-brand-600 hover:underline">Back to the Act</Link>
          </div>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {data.hits!.map((hit) => (
              <li key={hit.id}>
                <Link href={`${basePath}?part=${hit.part_id}#s-${hit.id}`} className="block px-4 py-3 transition-colors hover:bg-surface-muted">
                  <span className="text-sm font-semibold text-ink">{hit.kind} {hit.number ? `${hit.number}. ` : ''}{hit.title}</span>
                  {hit.snippet && <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{hit.snippet}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : view === 'arrangement' ? (
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-xl font-bold uppercase tracking-wide text-ink">{act.subtitle || (unit === 'rules' ? 'Arrangement of Rules' : 'Arrangement of Sections')}</h2>
          <div className="mt-6 space-y-6">
            {data.parts.map((part) => (
              <div key={part.id}>
                <h3 className="text-center text-sm font-bold uppercase tracking-wide text-ink">
                  {part.kind === 'Act' ? 'Sections' : part.kind === 'Chapter' ? `Chapter ${part.number ?? ''}` : part.number}
                  {part.kind !== 'Act' && <span className="mt-0.5 block font-semibold text-ink-soft">{part.title}</span>}
                </h3>
                <ol className="mt-2 space-y-1 text-sm">
                  {part.sections.map((s) => (
                    <li key={s.id}><Link href={`${basePath}?part=${part.id}#s-${s.id}`} className="block rounded px-2 py-1 text-ink-soft transition-colors hover:bg-surface-muted hover:text-brand-600">{sectionLabel(s)}</Link></li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="no-print min-w-0">
            <details className="rounded-xl border border-line p-3 lg:hidden">
              <summary className="cursor-pointer text-sm font-semibold text-ink">Arrangement of Sections</summary>
              <div className="mt-3 max-h-80 overflow-y-auto"><Contents data={data} basePath={basePath} activeId={selected?.part.id ?? null} /></div>
            </details>
            <nav aria-label="Arrangement of Sections" className="hidden lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-2">
              <p className="mb-2 px-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">{act.subtitle || (unit === 'rules' ? 'Arrangement of Rules' : 'Arrangement of Sections')}</p>
              <Contents data={data} basePath={basePath} activeId={selected?.part.id ?? null} />
            </nav>
          </aside>
          <div className="min-w-0">
            {selected ? (
              <>
                <header className="mb-2 text-center">
                  {selected.part.kind !== 'Act' && <p className="text-sm font-semibold uppercase tracking-widest text-ink-muted">{selected.part.kind === 'Chapter' ? `Chapter ${selected.part.number ?? ''}` : selected.part.number}</p>}
                  <h2 className="mt-1 text-xl font-bold uppercase tracking-wide text-ink">{selected.part.kind === 'Act' ? act.act_name : selected.part.title}</h2>
                </header>
                {selected.intro && (
                  <div className="border-b border-line py-4"><Body p={selected.intro} /><Notes p={selected.intro} /></div>
                )}
                {selected.provisions.length === 0 ? (
                  selected.intro ? null : <p className="py-10 text-center text-sm text-ink-muted">No sections have been written in this part yet.</p>
                ) : selected.provisions.map((p) => <Section key={p.id} p={p} />)}
                <div className="no-print mt-6 flex items-center justify-between gap-3 text-sm font-semibold">
                  {selected.previous !== null ? <Link href={`${basePath}?part=${selected.previous}`} className="rounded-lg border border-line px-4 py-2 text-ink-soft hover:bg-surface-muted">Previous</Link> : <span />}
                  {selected.next !== null ? <Link href={`${basePath}?part=${selected.next}`} className="rounded-lg border border-line px-4 py-2 text-ink-soft hover:bg-surface-muted">Next</Link> : <span />}
                </div>
              </>
            ) : (
              <p className="py-16 text-center text-ink-muted">This Act has no text yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
