import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@dancehall/shared'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'no-store' },
          // A strict nonce-based CSP is added together with staff authentication (Phase 1+).
        ],
      },
    ];
  },
};
export default config;
