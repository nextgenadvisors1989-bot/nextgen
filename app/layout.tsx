import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  icons: { icon: '/brand/favicon.png', shortcut: '/brand/favicon.png', apple: '/brand/favicon.png' },
  title: {
    default: 'ComplianceOS — Compliance, Audit, HR & Payroll Platform',
    template: '%s | ComplianceOS',
  },
  description:
    'Enterprise platform for statutory compliance, safety audits, HR, payroll and workforce management. Manage employers, auditors, audits, compliance registers, attendance and payroll end to end.',
  keywords: [
    'compliance management software', 'safety audit software', 'statutory compliance India',
    'HR payroll platform', 'audit management system', 'contract labour compliance',
  ],
  authors: [{ name: 'ComplianceOS Technologies' }],
  openGraph: {
    title: 'ComplianceOS — Compliance, Audit, HR & Payroll Platform',
    description: 'One platform for audits, compliance, HR and payroll.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1e293b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface-canvas antialiased">{children}</body>
    </html>
  );
}
