import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  APP_ENV: Joi.string().valid('development', 'uat', 'production').default('development'),
  PORT: Joi.number().default(3001),
  API_URL: Joi.string().uri().required(),
  WEB_URL: Joi.string().uri().required(),
  ALLOWED_ORIGINS: Joi.string().required(),

  DATABASE_URL: Joi.string().required(),
  DIRECT_URL: Joi.string().required(),

  REDIS_URL: Joi.string().required(),

  JWT_PRIVATE_KEY: Joi.string().required(),
  JWT_PUBLIC_KEY: Joi.string().required(),
  JWT_ACCESS_EXPIRY: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRY: Joi.string().default('7d'),

  QR_HMAC_SECRET: Joi.string().min(32).required(),

  SMTP_HOST: Joi.string().hostname().default('smtp-relay.brevo.com'),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().optional().allow(''),
  SMTP_PASS: Joi.string().optional().allow(''),
  SMTP_FROM_EMAIL: Joi.string().email().optional().allow(''),
  SMTP_FROM_NAME: Joi.string().default('Axon Tickets'),

  CLOUDINARY_CLOUD_NAME: Joi.string().required(),
  CLOUDINARY_API_KEY: Joi.string().required(),
  CLOUDINARY_API_SECRET: Joi.string().required(),

  HCAPTCHA_SECRET: Joi.string().required(),

  THROTTLE_TTL: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(60),
  OTP_HOURLY_LIMIT: Joi.number().integer().min(1).default(10),
});
