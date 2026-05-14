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

let cachedApp: Express | null = null;

async function buildApp(): Promise<Express> {
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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
  });

  app.setGlobalPrefix('api/v1');

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
  if (!cachedApp) {
    cachedApp = await buildApp();
  }
  cachedApp(req as any, res as any);
}
