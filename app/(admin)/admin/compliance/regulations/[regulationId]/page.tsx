import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/permission-check';
import { hasPermission } from '@/lib/auth/permission-check';
import { getRegulationDetail } from '@/services/compliance.service';
import { RegulationDetail } from '@/components/compliance/regulation-detail';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ regulationId: string }> }): Promise<Metadata> {
  const { regulationId } = await params;
  try {
    const data = await getRegulationDetail(Number(regulationId));
    return { title: data.regulation.regulation_name };
  } catch {
    return { title: 'Compliance Instrument' };
  }
}

export default async function RegulationDetailPage({ params }: { params: Promise<{ regulationId: string }> }) {
  const { regulationId } = await params;
  const id = Number(regulationId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await requirePageUser();
  let data;
  try {
    data = await getRegulationDetail(id);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') notFound();
    throw error;
  }

  return (
    <RegulationDetail
      regulation={JSON.parse(JSON.stringify(data.regulation))}
      canUpdate={hasPermission(user.permissions, 'compliance_regulation.update')}
    />
  );
}
