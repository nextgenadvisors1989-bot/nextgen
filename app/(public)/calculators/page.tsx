import type { Metadata } from 'next';
import Link from 'next/link';
import { Calculators } from '@/components/public/calculators';

export const metadata: Metadata = {
  title: 'Safety & Environmental Calculation',
  description: 'Free calculators: the safety officer\'s 15 calculations (LTIFR, TRIR, AFR, ASR, incident rate, man-hours, fire extinguisher cover, noise dose, safe oxygen, LEL and UEL, scaffold load, power, pressure, lifting SWL, risk matrix), emissions, effluent load, water balance, EPF, ESI, gratuity, bonus and overtime.',
};

export default async function CalculatorsPage({ searchParams }: { searchParams: Promise<{ tool?: string }> }) {
  const { tool } = await searchParams;
  return (
    <>
      <section className="border-b border-line bg-surface-muted py-14">
        <div className="mx-auto max-w-5xl px-4 lg:px-8">
          <h1 className="text-4xl font-bold text-ink">Safety &amp; Environmental Calculation</h1>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-muted">
            The safety officer's calculations (injury rates, man-hours, fire extinguisher cover, noise, oxygen, flammable gas, scaffold, power, pressure, lifting load and the risk matrix), then emissions, effluent load and water balance, and the payroll figures that go with them: EPF, ESI, gratuity, bonus and overtime.
          </p>
        </div>
      </section>
      <section className="py-12">
        <div className="mx-auto max-w-5xl px-4 lg:px-8">
          <Calculators initial={tool} />
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/quotation" className="rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700">Get a quotation</Link>
            <Link href="/contact" className="rounded-lg border border-line bg-white px-6 py-3 text-sm font-semibold text-ink-soft hover:bg-surface-muted">Talk to an expert</Link>
          </div>
        </div>
      </section>
    </>
  );
}
