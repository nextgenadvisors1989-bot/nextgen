import type { Metadata } from 'next';
import { DmRegisterPage } from '@/components/data-management/dm-pages';

export const metadata: Metadata = { title: 'Data Management register' };
export const dynamic = 'force-dynamic';

export default async function Page({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ employer_id?: string }> }) {
  return <DmRegisterPage panel="employer" code={(await params).code} searchParams={searchParams} />;
}
