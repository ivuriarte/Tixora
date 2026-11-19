import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import * as express from 'express';
import type { Express } from 'express';
import type { IncomingMessage, ServerResponse } from 'http';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { SentryExceptionFilter } from './common/filters/sentry-exception.filter';
import { initSentry } from './common/logging/sentry-init';

let cachedApp: Express | null = null;

async function buildApp(): Promise<Express> {
  // This is the entry point Vercel runs for UAT and production, so Sentry must start
  // here too (main.ts is not used). No-op when SENTRY_DSN is not set.
  initSentry();

  const expressApp = express();

  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
    {
      bufferLogs: true,
      rawBody: true,
    },
  );
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const allowedOrigins = config.get<string[]>('allowedOrigins') ?? [];

  app.use(helmet());

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Idempotency-Key',
      'X-Registration-Token',
    ],
  });

  app.setGlobalPrefix('api/v1');

  // Global response envelope: { success: true, data: ... }
  app.useGlobalInterceptors(new TransformInterceptor());

  // Forward unhandled 500+ errors to Sentry (client errors below 500 are not reported)
  app.useGlobalFilters(new SentryExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.init();
  return expressApp;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  try {
    if (!cachedApp) {
      cachedApp = await buildApp();
    }
    cachedApp(req as any, res as any);
  } catch (err) {
    console.error('[serverless] buildApp error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server initialization failed', message: String(err) }));
  }
}
