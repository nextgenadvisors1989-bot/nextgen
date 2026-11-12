import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readAct } from '@/services/act-reader.service';
import { ActReader } from '@/components/acts/act-reader';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ actId: string }>; searchParams: Promise<{ part?: string; q?: string; view?: string }> };

const idOf = (value: string) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = idOf((await params).actId);
  const data = id ? await readAct(id, 'public', { outline: true }) : null;
  return data ? { title: data.act.act_name, description: data.act.subtitle ?? `The text of ${data.act.act_name}: chapters, sections, sub sections and amendments.` } : { title: 'Acts & Compliance' };
}

export default async function PublicActPage({ params, searchParams }: Props) {
  const id = idOf((await params).actId);
  const sp = await searchParams;
  if (!id) notFound();
  const part = sp.part !== undefined && /^\d+$/.test(sp.part) ? Number(sp.part) : null;
  const data = await readAct(id, 'public', { part, q: sp.q });
  if (!data) notFound();

  return (
    <>
      <section className="border-b border-line bg-surface-muted py-10">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
            <Link href="/acts-compliance" className="hover:text-brand-600 hover:underline">Acts &amp; Compliance</Link>
            <span aria-hidden className="mx-2">/</span>
            <span className="text-ink-soft">{data.act.short_name ?? data.act.act_name}</span>
          </nav>
          <h1 className="mt-3 text-3xl font-bold leading-tight text-ink sm:text-4xl">{data.act.act_name}</h1>
          {data.act.subtitle && <p className="mt-2 text-lg text-ink-muted">{data.act.subtitle}</p>}
        </div>
      </section>
      <section className="py-10">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <ActReader data={data} basePath={`/acts-compliance/${id}`} view={sp.view === 'arrangement' ? 'arrangement' : 'part'} />
        </div>
      </section>
    </>
  );
}
