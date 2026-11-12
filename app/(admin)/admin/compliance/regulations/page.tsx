import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/permission-check';

export const dynamic = 'force-dynamic';

/** The list moved to Obligations & Notices (one tab each); this address keeps old links and bookmarks working. */
export default async function ComplianceRegulationsPage() {
  await requirePageUser();
  redirect('/admin/compliance/notices?tab=regulations');
}
