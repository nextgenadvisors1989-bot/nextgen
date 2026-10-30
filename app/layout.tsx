import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  icons: { icon: '/brand/favicon.png', shortcut: '/brand/favicon.png', apple: '/brand/favicon.png' },
  title: {
    default: 'NextGen Socio & Enviro Advisors — Audit, Compliance, HR & Payroll Platform',
    template: '%s | NextGen Socio & Enviro Advisors',
  },
  description:
    'NextGen Socio and Enviro Advisors: one platform for statutory compliance, safety and environmental audits, CAPAR reports, HR and payroll. www.nextgenseadvisors.com',
  keywords: [
    'compliance management software', 'safety audit software', 'statutory compliance India',
    'HR payroll platform', 'audit management system', 'contract labour compliance',
  ],
  authors: [{ name: 'NextGen Socio and Enviro Advisors' }],
  openGraph: {
    title: 'NextGen Socio & Enviro Advisors — Audit, Compliance, HR & Payroll Platform',
    description: 'One Legal Culture: audits, legal compliance, HR and payroll in one place. www.nextgenseadvisors.com',
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
