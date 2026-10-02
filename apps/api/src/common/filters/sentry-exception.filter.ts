import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';

type JsonResponse = { status: (code: number) => { json: (body: unknown) => void } };

/**
 * Errors thrown by Express middleware (e.g. body-parser: malformed JSON, payload too large)
 * are plain objects carrying an HTTP status, not Nest HttpExceptions.
 */
function httpErrorStatus(exception: unknown): number | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const candidate = exception as { status?: unknown; statusCode?: unknown; expose?: unknown };
  const status = typeof candidate.status === 'number' ? candidate.status : candidate.statusCode;
  return typeof status === 'number' && status >= 400 && status < 600 ? status : null;
}

/**
 * Global exception filter that forwards unhandled errors to Sentry.
 * Client errors (4xx) are expected and are NOT reported.
 * Server errors (5xx, unexpected throws) are captured and flushed before responding, because
 * a serverless function may be frozen as soon as the response is sent.
 */
@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SentryExceptionFilter.name);

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const response = host.switchToHttp().getResponse<JsonResponse>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) await this.report(exception);
      response.status(status).json(exception.getResponse());
      return;
    }

    const status = httpErrorStatus(exception);
    if (status !== null && status < 500) {
      // e.g. body-parser: 400 malformed JSON, 413 payload too large. Keep the client's status.
      const message = (exception as { message?: unknown }).message;
      response.status(status).json({ statusCode: status, message: typeof message === 'string' ? message : 'Bad request' });
      return;
    }

    this.logger.error('Unhandled exception', exception);
    await this.report(exception);
    response.status(500).json({ statusCode: 500, message: 'Internal server error' });
  }

  private async report(exception: unknown): Promise<void> {
    try {
      Sentry.captureException(exception);
      await Sentry.flush(2000);
    } catch {
      // Reporting must never break the response.
    }
  }
}
