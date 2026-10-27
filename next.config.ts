import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The dev server is reached through the sandbox's preview proxy, whose host
  // differs from localhost. Next.js refuses cross-origin dev asset requests by
  // default, which would make the preview render without CSS or JS, so the proxy
  // host is allowed here. Production builds ignore this setting.
  allowedDevOrigins: ['*.e2b.app', '*.e2b.dev', 'localhost', '127.0.0.1'],
  poweredByHeader: false,
  serverExternalPackages: ['mysql2', 'pdfkit', 'nodemailer', 'bcryptjs'],
  experimental: {
    serverActions: { bodySizeLimit: '25mb' },
    // The deployment target is a small 2 vCPU box: one build worker and the
    // webpack memory optimisations keep the peak under the box's RAM.
    cpus: 1,
    webpackMemoryOptimizations: true,
    // Pull only the icons/charts/animation primitives a page uses instead of whole packages.
    optimizePackageImports: ['recharts', 'framer-motion'],
    // Middleware buffers request bodies; its default 10 MB cap truncated uploads and broke files up to the 25 MB the vault allows.
    middlewareClientMaxBodySize: '30mb',
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
