import type { ReactNode } from 'react';
import '@fontsource-variable/source-serif-4/index.css';
import { getHomeBlocks, getSiteInfo } from '@/services/site.service';
import { TopBar } from '@/components/public/top-bar';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';

/** Public marketing site chrome: utility bar, sticky header with mega-menus, content slot, footer. */
export async function PublicLayout({ children }: { children: ReactNode }) {
  const [site, blocks] = await Promise.all([getSiteInfo(), getHomeBlocks()]);
  const titles = (key: string) => blocks[key].items.map((item) => item.title).filter((title): title is string => Boolean(title));
  return (
    <div className="public-theme flex min-h-screen flex-col bg-white">
      <TopBar site={site} />
      <SiteHeader phone={site.phone} email={site.email} />
      <main className="flex-1">{children}</main>
      <SiteFooter site={site} services={titles('services')} acts={titles('acts')} />
    </div>
  );
}
