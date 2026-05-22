import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import * as express from 'express';
import type { Express } from 'express';
import type { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

// Tell Vercel NOT to pre-parse/consume the request body — multer must read
// the raw multipart stream itself, otherwise file uploads silently arrive as
// `undefined` and the controller throws "Image file is required".
export const config = {
  api: {
    bodyParser: false,
  },
};

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

  // Global response envelope: { success: true, data: ... }
  app.useGlobalInterceptors(new TransformInterceptor());

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

    // Defensive: if Vercel (or any upstream) already buffered the body and
    // attached it as `req.body`, the underlying socket stream is drained and
    // multer / busboy will see an empty stream. Re-emit the buffered bytes as
    // a fresh Readable so multipart uploads still work.
    const anyReq = req as any;
    const ct = String(req.headers['content-type'] || '');
    const isMultipart = ct.toLowerCase().startsWith('multipart/');
    if (isMultipart && anyReq.body !== undefined && anyReq.body !== null) {
      const raw: Buffer = Buffer.isBuffer(anyReq.body)
        ? anyReq.body
        : typeof anyReq.body === 'string'
          ? Buffer.from(anyReq.body)
          : Buffer.from(JSON.stringify(anyReq.body));
      const stream = Readable.from(raw);
      // Wire the new stream's events through req so express/multer read it.
      anyReq.read = stream.read.bind(stream);
      anyReq.pipe = stream.pipe.bind(stream);
      anyReq.unpipe = stream.unpipe.bind(stream);
      anyReq.on = stream.on.bind(stream);
      anyReq.once = stream.once.bind(stream);
      anyReq.removeListener = stream.removeListener.bind(stream);
      anyReq.removeAllListeners = stream.removeAllListeners.bind(stream);
      anyReq.addListener = stream.addListener.bind(stream);
      anyReq.emit = stream.emit.bind(stream);
      anyReq.headers['content-length'] = String(raw.length);
      delete anyReq.body;
    }

    cachedApp(req as any, res as any);
  } catch (err) {
    console.error('[serverless] buildApp error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server initialization failed', message: String(err) }));
  }
}
