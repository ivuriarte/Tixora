// @ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_ENABLE_ONLINE_PAYMENT: process.env.NEXT_PUBLIC_ENABLE_ONLINE_PAYMENT ?? 'false',
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      // Sponsor logos may come from any HTTPS host — allow all via wildcard
      { protocol: 'https', hostname: '**' },
    ],
  },
  experimental: {
    serverActions: { allowedOrigins: [] },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // next.js runtime + react hydration require 'unsafe-inline' scripts
              // until nonce-based CSP is adopted in a future hardening pass
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://hcaptcha.com https://*.hcaptcha.com https://vercel.live https://connect.facebook.net",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // images allowed from any HTTPS host to match next/image remotePatterns wildcard
              "img-src 'self' data: blob: https:",
              "font-src 'self' https://fonts.gstatic.com",
              // Sentry tunnel and reporting endpoints
              "connect-src 'self' https://api.axontickets.online https://*.vercel.app https://*.sentry.io https://*.ingest.sentry.io https://vercel.live https://connect.facebook.net https://www.facebook.com wss://ws-us3.pusher.com",
              // Sentry Replay and Vercel toolbar use blob: workers
              "worker-src 'self' blob:",
              "frame-src https://hcaptcha.com https://*.hcaptcha.com https://vercel.live",
              "object-src 'none'",
              "base-uri 'self'",
            ].join('; '),
          },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
    ];
  },
};

export default nextConfig;
