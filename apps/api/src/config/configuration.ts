export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3001', 10),
  apiUrl: process.env.API_URL,
  webUrl: process.env.WEB_URL,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()),

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    url: process.env.REDIS_URL,
  },

  jwt: {
    privateKey: (process.env.JWT_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    publicKey: (process.env.JWT_PUBLIC_KEY ?? '').replace(/\\n/g, '\n'),
    accessExpiry: process.env.JWT_ACCESS_EXPIRY ?? '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY ?? '7d',
  },

  qr: {
    hmacSecret: process.env.QR_HMAC_SECRET ?? '',
  },

  resend: {
    apiKey: process.env.RESEND_API_KEY ?? '',
    fromEmail: process.env.RESEND_FROM_EMAIL ?? '',
    fromName: process.env.RESEND_FROM_NAME ?? 'Axon Tickets',
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
  },

  paymongo: {
    secretKey: process.env.PAYMONGO_SECRET_KEY ?? '',
    publicKey: process.env.PAYMONGO_PUBLIC_KEY ?? '',
    webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET ?? '',
  },

  hcaptcha: {
    secret: process.env.HCAPTCHA_SECRET ?? '',
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '60', 10),
  },
});
