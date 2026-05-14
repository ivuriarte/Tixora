import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },
  experimental: {
    serverActions: { allowedOrigins: [] },
  },
  // Turbopack is default in Next 14 dev; no extra config needed
};

export default nextConfig;
