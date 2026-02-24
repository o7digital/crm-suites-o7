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
