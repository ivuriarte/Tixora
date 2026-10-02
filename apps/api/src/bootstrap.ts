import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { SentryExceptionFilter } from './common/filters/sentry-exception.filter';
import { scrubSentryEvent } from './common/logging/sentry-scrub';

/**
 * Setup shared by BOTH entry points:
 *   - main.ts        (local dev, long-running server)
 *   - serverless.ts  (Vercel production + UAT)
 * Keep them identical here so production behaves exactly like what is tested locally.
 */

/** Initialise Sentry. No-op when SENTRY_DSN is not set. Safe to call more than once. */
export function initSentry(): void {
  const sentryDsn = process.env.SENTRY_DSN;
  if (!sentryDsn || Sentry.isInitialized()) return;
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.APP_ENV ?? 'development',
    tracesSampleRate: process.env.APP_ENV === 'production' ? 0.1 : 1.0,
    beforeSend: scrubSentryEvent,
    beforeSendTransaction: scrubSentryEvent,
  });
}

/** Security headers, CORS, global prefix, response envelope, error filter and validation. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const allowedOrigins = config.get<string[]>('allowedOrigins') ?? [];

  app.use(helmet());

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key', 'X-Registration-Token'],
  });

  app.setGlobalPrefix('api/v1');

  // Global response envelope: { success: true, data: ... }
  app.useGlobalInterceptors(new TransformInterceptor());

  // Forward unhandled 500+ errors to Sentry (no-op when DSN is not configured)
  app.useGlobalFilters(new SentryExceptionFilter());

  // Strict validation: strips unknown fields and rejects unexpected ones
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
}
