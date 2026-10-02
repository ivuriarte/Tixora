import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Logger as NestLogger } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import * as Sentry from '@sentry/node';
import * as express from 'express';
import type { Express } from 'express';
import type { IncomingMessage, ServerResponse } from 'http';
import { AppModule } from './app.module';
import { configureApp, initSentry } from './bootstrap';

// Cache the *promise* (not the result) so concurrent cold starts share one app
// instead of each building its own Prisma/Redis connections.
let appPromise: Promise<Express> | null = null;

async function buildApp(): Promise<Express> {
  initSentry();

  const expressApp = express();

  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
    bufferLogs: true,
    rawBody: true,
  });
  app.useLogger(app.get(Logger));

  configureApp(app);

  await app.init();
  return expressApp;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    appPromise ??= buildApp();
    const app = await appPromise;
    app(req as any, res as any);
  } catch (err) {
    // Allow the next request to retry the build instead of caching a failure.
    appPromise = null;
    // Details go to the logs and Sentry only; never to the caller (may contain config hints).
    new NestLogger('serverless').error(
      `buildApp failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
    );
    Sentry.captureException(err);
    await Sentry.flush(2000).catch(() => undefined);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ statusCode: 500, message: 'Server initialization failed' }));
  }
}
