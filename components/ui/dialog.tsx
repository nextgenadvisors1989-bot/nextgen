'use client';

import type { ReactNode } from 'react';
import { Modal } from './modal';

/**
 * Thin semantic wrapper over Modal for forms and confirmation flows that need a
 * consistent header/body/footer split.
 */
export function Dialog({ open, onClose, title, children, footer, size = 'md' }: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} footer={footer} size={size}>
      {children}
    </Modal>
  );
}
