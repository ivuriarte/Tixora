export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  appEnv: process.env.APP_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3001', 10),
  apiUrl: process.env.API_URL,
  webUrl: process.env.WEB_URL,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),

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

  smtp: {
    host: process.env.SMTP_HOST ?? 'smtp-relay.brevo.com',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    fromEmail: process.env.SMTP_FROM_EMAIL ?? '',
    fromName: process.env.SMTP_FROM_NAME ?? 'Axon Tickets',
    // UAT: allowlist of emails that can receive messages. Blocks all others at API layer.
    // Set via SMTP_ALLOWLIST=email1@example.com,email2@example.com
    // Empty allowlist = no emails sent (safe default for UAT)
    allowlist: process.env.APP_ENV === 'uat'
      ? (process.env.SMTP_ALLOWLIST ?? 'ivvuriarte@gmail.com').split(',').map(e => e.trim())
      : [], // Production has no allowlist (all recipients accepted)
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
    // UAT uploads use separate folder: axon-tickets/uat/...
    // Production uploads use: axon-tickets/prod/...
    folder: process.env.APP_ENV === 'uat' ? 'axon-tickets/uat' : 'axon-tickets/prod',
  },

  hcaptcha: {
    secret: process.env.HCAPTCHA_SECRET ?? '',
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '60', 10),
  },

  sentry: {
    dsn: process.env.SENTRY_DSN ?? '',
    environment: process.env.APP_ENV ?? 'development',
    // Commit SHA from Vercel or git for release tracking
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? 'unknown',
    tracesSampleRate: process.env.APP_ENV === 'production' ? 0.1 : 0.01,
  },

  // QR token validation: UAT tokens cannot be used by Production and vice versa
  qrEnvironmentBoundary: {
    enabled: true, // Always validate environment boundary
    environment: process.env.APP_ENV ?? 'development',
  },

  // PayMongo: UAT must only use test keys
  paymongo: {
    secretKey: process.env.PAYMONGO_SECRET_KEY ?? '',
    publicKey: process.env.PAYMONGO_PUBLIC_KEY ?? '',
    webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET ?? '',
    // Prevent live keys in UAT
    isTestMode: process.env.APP_ENV === 'uat',
  },
});
