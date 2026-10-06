import type { NextConfig } from 'next';

function normalizeApiOrigin(raw?: string): string {
  const value = (raw || '').trim();
  if (!value) return '';
  const trimmed = value.replace(/\/+$/, '');
  if (trimmed.endsWith('/api')) return trimmed.slice(0, -4);
  return trimmed;
}

const proxiedApiOrigin = normalizeApiOrigin(
  process.env.NEXT_PUBLIC_API_ROOT || process.env.NEXT_PUBLIC_API_URL,
);

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/sign/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
  async rewrites() {
    if (!proxiedApiOrigin) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${proxiedApiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
