import Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
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

  RESEND_API_KEY: Joi.string().required(),
  RESEND_FROM_EMAIL: Joi.string().email().required(),
  RESEND_FROM_NAME: Joi.string().default('Tixora'),

  CLOUDINARY_CLOUD_NAME: Joi.string().required(),
  CLOUDINARY_API_KEY: Joi.string().required(),
  CLOUDINARY_API_SECRET: Joi.string().required(),

  PAYMONGO_SECRET_KEY: Joi.string().required(),
  PAYMONGO_PUBLIC_KEY: Joi.string().required(),
  PAYMONGO_WEBHOOK_SECRET: Joi.string().required(),

  HCAPTCHA_SECRET: Joi.string().required(),

  THROTTLE_TTL: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(60),
});
