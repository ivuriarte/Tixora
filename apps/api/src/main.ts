import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp, initSentry } from './bootstrap';

// Refuse to start the UAT instance if it is misconfigured in a way that
// could affect production data.
function assertUatSafety(): void {
  if (process.env.APP_ENV !== 'uat') return;

  const errors: string[] = [];
  const webUrl = process.env.WEB_URL ?? '';
  const apiUrl = process.env.API_URL ?? '';

  if (webUrl === 'https://axontickets.online' || webUrl === 'https://www.axontickets.online') {
    errors.push(`WEB_URL "${webUrl}" is the production domain — UAT must use https://uat.axontickets.online`);
  }
  if (apiUrl === 'https://api.axontickets.online') {
    errors.push(`API_URL "${apiUrl}" is the production domain — UAT must use https://api-uat.axontickets.online`);
  }

  if (errors.length === 0) return;

  process.stderr.write('\n[FATAL] UAT safety assertions failed — refusing to start:\n\n');
  for (const e of errors) process.stderr.write(`  • ${e}\n`);
  process.stderr.write('\n');
  process.exit(1);
}

async function bootstrap() {
  assertUatSafety();

  // Initialise Sentry before anything else so all errors (including bootstrap
  // failures) are captured. No-op when SENTRY_DSN is not set.
  initSentry();

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  // Pino structured logging
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const port    = config.get<number>('port') ?? 3001;
  const appEnv  = config.get<string>('appEnv');

  // Headers, CORS, prefix, envelope, Sentry filter, validation (shared with serverless.ts)
  configureApp(app);

  // Swagger — available in development and UAT, never in production
  if (appEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Axon Tickets API')
      .setDescription('Online ticketing platform API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(port);
}

bootstrap();
