import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { MediaLibrary } from '@/components/cms/media-library';

export const metadata: Metadata = { title: 'Media Library' };
export const dynamic = 'force-dynamic';

export default async function CmsMediaPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Media Library</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Every image, video, audio file and document the website draws on. Uploads go through the document vault, so
          each asset is checksummed, versioned and access-controlled, and its public address is ready to paste into a
          page or block. Before removing an asset, the library tells you which pages still use it.
        </p>
      </header>
      <MediaLibrary
        canUpload={hasPermission(user.permissions, 'cms_media.upload')}
        canEdit={hasPermission(user.permissions, 'cms_media.update')}
        canDelete={hasPermission(user.permissions, 'cms_media.delete')}
      />
    </div>
  );
}
