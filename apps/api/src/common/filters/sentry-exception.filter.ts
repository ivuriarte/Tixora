import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';

/** How long a serverless function waits for Sentry to send an event before replying. */
const FLUSH_TIMEOUT_MS = 2000;

/**
 * Global exception filter that forwards unhandled errors to Sentry.
 * HttpExceptions with status < 500 are ignored (expected, client-caused errors).
 * All other errors (500+, unexpected throws) are captured.
 *
 * Responses match Nest's default handler: an HttpException keeps its own body, and a bare
 * string body becomes `{ statusCode, message }`.
 */
@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SentryExceptionFilter.name);

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : 500;

    // Only capture server-side errors — not client errors (4xx)
    if (!isHttpException || status >= 500) {
      Sentry.captureException(exception);
      // A serverless function can be frozen as soon as it replies, so give the event
      // time to leave first. A flush failure must never change the response.
      try {
        await Sentry.flush(FLUSH_TIMEOUT_MS);
      } catch {
        // ignore
      }
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();

    if (isHttpException) {
      const exceptionResponse = exception.getResponse();
      response
        .status(status)
        .json(
          typeof exceptionResponse === 'string'
            ? { statusCode: status, message: exceptionResponse }
            : exceptionResponse,
        );
    } else {
      this.logger.error('Unhandled exception', exception);
      response.status(500).json({
        statusCode: 500,
        message: 'Internal server error',
      });
    }
  }
}
