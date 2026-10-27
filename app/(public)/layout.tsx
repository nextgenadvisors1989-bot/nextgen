import { PublicLayout } from '@/components/layouts/public-layout';

export const dynamic = 'force-dynamic';

/** Every public page shares the marketing chrome (sticky nav, rich footer). */
export default function PublicSiteLayout({ children }: { children: React.ReactNode }) {
  return <PublicLayout>{children}</PublicLayout>;
}
