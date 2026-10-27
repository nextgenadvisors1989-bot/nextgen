import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { RuleForm, EMPTY_RULE } from '@/components/compliance/rule-form';

export const metadata: Metadata = { title: 'Add Compliance Obligation' };
export const dynamic = 'force-dynamic';

export default async function CreateRulePage({ searchParams }: { searchParams: Promise<{ act_id?: string }> }) {
  await requirePageUser();
  const { act_id } = await searchParams;
  const initial = act_id ? { ...EMPTY_RULE, act_id } : undefined;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Add an Obligation</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Recurring obligations need the day of the month they fall due — the expiry and due-date reminders read it.
        </p>
      </header>
      <RuleForm mode="create" initial={initial} />
    </div>
  );
}
