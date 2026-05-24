import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';

/**
 * Global exception filter that forwards unhandled errors to Sentry.
 * HttpExceptions with status < 500 are ignored (expected, client-caused errors).
 * All other errors (500+, unexpected throws) are captured.
 */
@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SentryExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : 500;

    // Only capture server-side errors — not client errors (4xx)
    if (!isHttpException || status >= 500) {
      Sentry.captureException(exception);
    }

    // Re-throw so NestJS default exception handler still sends the HTTP response
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();

    if (isHttpException) {
      const exceptionResponse = exception.getResponse();
      response.status(status).json(exceptionResponse);
    } else {
      this.logger.error('Unhandled exception', exception);
      response.status(500).json({
        statusCode: 500,
        message: 'Internal server error',
      });
    }
  }
}
