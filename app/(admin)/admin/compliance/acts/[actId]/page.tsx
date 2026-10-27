import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/permission-check';
import { hasPermission } from '@/lib/auth/rbac';
import { getActDetail } from '@/services/compliance.service';
import { ActDetail } from '@/components/compliance/act-detail';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ actId: string }> }): Promise<Metadata> {
  const { actId } = await params;
  try {
    const data = await getActDetail(Number(actId));
    return { title: data.act.act_name };
  } catch {
    return { title: 'Compliance Act' };
  }
}

export default async function ActDetailPage({ params }: { params: Promise<{ actId: string }> }) {
  const { actId } = await params;
  const id = Number(actId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await requirePageUser();
  let data;
  try {
    data = await getActDetail(id);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') notFound();
    throw error;
  }

  return (
    <ActDetail
      data={JSON.parse(JSON.stringify(data))}
      canUpdate={hasPermission(user.permissions, 'compliance_act.update')}
      canCreate={hasPermission(user.permissions, 'compliance_rule.create')}
    />
  );
}
