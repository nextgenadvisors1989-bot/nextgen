import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/permission-check';
import { hasPermission } from '@/lib/auth/permission-check';
import { getRuleDetail } from '@/services/compliance.service';
import { RuleDetail } from '@/components/compliance/rule-detail';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ ruleId: string }> }): Promise<Metadata> {
  const { ruleId } = await params;
  try {
    const data = await getRuleDetail(Number(ruleId));
    return { title: data.rule.rule_title };
  } catch {
    return { title: 'Compliance Obligation' };
  }
}

export default async function RuleDetailPage({ params }: { params: Promise<{ ruleId: string }> }) {
  const { ruleId } = await params;
  const id = Number(ruleId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await requirePageUser();
  let data;
  try {
    data = await getRuleDetail(id);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') notFound();
    throw error;
  }

  return (
    <RuleDetail
      rule={JSON.parse(JSON.stringify(data.rule))}
      regulations={JSON.parse(JSON.stringify(data.regulations))}
      canUpdate={hasPermission(user.permissions, 'compliance_rule.update')}
    />
  );
}
