import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { GuidePage } from '@/components/help/guide-page';

export const metadata: Metadata = { title: 'Help & Guide' };
export const dynamic = 'force-dynamic';

export default async function HelpPage() {
  const user = await requirePageUser();
  return <GuidePage role="employee" permissions={user.permissions} />;
}
