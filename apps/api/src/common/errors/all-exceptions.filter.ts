import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError, ErrorCode, type FieldErrors } from './app-error.js';

interface ErrorBody {
  success: false;
  error: { code: ErrorCode; message: string; fields?: FieldErrors };
  requestId?: string;
}

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  400: ErrorCode.BAD_REQUEST,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  413: ErrorCode.PAYLOAD_TOO_LARGE,
  429: ErrorCode.RATE_LIMITED,
  503: ErrorCode.SERVICE_UNAVAILABLE,
};

/**
 * Renders every error in the standard envelope:
 * { success: false, error: { code, message, fields? }, requestId }.
 * Unexpected errors are logged with their stack and never leak internals to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();
    const { status, body } = this.toResponse(exception);

    body.requestId = req.id;
    if (exception instanceof AppError && exception.retryAfterSeconds !== undefined) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(exception.retryAfterSeconds))));
    }
    if (status >= 500) {
      this.logger.error(
        { err: exception, requestId: body.requestId },
        'Unhandled error while processing request',
      );
    }
    res.status(status).json(body);
  }

  private toResponse(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof AppError) {
      return {
        status: exception.status,
        body: {
          success: false,
          error: {
            code: exception.code,
            message: exception.message,
            ...(exception.fields ? { fields: exception.fields } : {}),
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return { status, body: this.envelope(status, messageOf(exception.getResponse())) };
    }

    // Other Express middleware errors that carry a 4xx status: keep the status, hide internals.
    const httpLike = exception as { status?: unknown };
    if (typeof httpLike?.status === 'number' && httpLike.status >= 400 && httpLike.status < 500) {
      return { status: httpLike.status, body: this.envelope(httpLike.status, 'Bad request') };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: this.envelope(HttpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred'),
    };
  }

  private envelope(status: number, message: string): ErrorBody {
    const code = STATUS_TO_CODE[status] ?? (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST);
    return { success: false, error: { code, message } };
  }
}

function messageOf(response: string | object): string {
  if (typeof response === 'string') return response;
  const message = (response as { message?: unknown }).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join('; ');
  return 'Request failed';
}
