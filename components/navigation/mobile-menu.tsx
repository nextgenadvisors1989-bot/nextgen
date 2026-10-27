'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { MobileSidebar, Sidebar, type MenuSection } from './sidebar';

/** Mobile drawer that wraps the shared Sidebar and closes on navigation. */
export function MobileMenu({ open, onClose, sections, panelLabel }: {
  open: boolean;
  onClose: () => void;
  sections: MenuSection[];
  panelLabel: string;
}) {
  const pathname = usePathname();

  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <MobileSidebar open={open} onClose={onClose}>
      <Sidebar sections={sections} panelLabel={panelLabel} onNavigate={onClose} />
    </MobileSidebar>
  );
}
