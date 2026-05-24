import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { SentryExceptionFilter } from './common/filters/sentry-exception.filter';

async function bootstrap() {
  // Initialise Sentry before anything else so all errors (including bootstrap
  // failures) are captured. No-op when SENTRY_DSN is not set.
  const sentryDsn = process.env.SENTRY_DSN;
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    });
  }

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true, // Required for PayMongo webhook signature verification
  });

  // Pino structured logging
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const allowedOrigins = config.get<string[]>('allowedOrigins') ?? [];
  const port = config.get<number>('port') ?? 3001;
  const env = config.get<string>('env');

  // Security headers
  app.use(helmet());

  // CORS
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Global response envelope: { success: true, data: ... }
  app.useGlobalInterceptors(new TransformInterceptor());

  // Forward unhandled 500+ errors to Sentry (no-op when DSN is not configured)
  app.useGlobalFilters(new SentryExceptionFilter());

  // Validation pipe — strict mode, strips unknown fields
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger — dev only
  if (env !== 'production') {
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
