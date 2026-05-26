import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    cpus: 1,
    optimizePackageImports: ['lucide-react'],
  },
  allowedDevOrigins: [
  '100.70.123.27',
  'dashboard.kiraduscha.my.id'
  ],
};

export default nextConfig;
