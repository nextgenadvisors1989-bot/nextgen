import type { Metadata } from 'next';
import { DmHomePage } from '@/components/data-management/dm-pages';

export const metadata: Metadata = { title: 'Data Management' };
export const dynamic = 'force-dynamic';

export default function Page({ searchParams }: { searchParams: Promise<{ employer_id?: string }> }) {
  return <DmHomePage panel="auditor" searchParams={searchParams} />;
}
