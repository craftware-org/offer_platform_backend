import { HttpStatus } from '@nestjs/common';

/** Stable, documented error codes. Clients may branch on these, so never rename one. */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  FIELDS_LOCKED: 'FIELDS_LOCKED',
  BUSINESS_NOT_VERIFIED: 'BUSINESS_NOT_VERIFIED',
  OTP_INVALID: 'OTP_INVALID',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  OTP_ATTEMPTS_EXCEEDED: 'OTP_ATTEMPTS_EXCEEDED',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  /** Admin area: this session hasn't passed the authenticator step (ADR-0018). */
  MFA_REQUIRED: 'MFA_REQUIRED',
  /** Admin area: set up an authenticator app first. */
  MFA_SETUP_REQUIRED: 'MFA_SETUP_REQUIRED',
  MFA_INVALID: 'MFA_INVALID',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type FieldErrors = Record<string, string>;

/** The only error type business code should throw. Rendered by the global exception filter. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: HttpStatus,
    message: string,
    readonly fields?: FieldErrors,
    /** Seconds the client should wait before retrying (sets the Retry-After header). */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static validation(fields: FieldErrors, message = 'Invalid request') {
    return new AppError(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, message, fields);
  }

  static unauthenticated(message = 'Authentication required') {
    return new AppError(ErrorCode.UNAUTHENTICATED, HttpStatus.UNAUTHORIZED, message);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError(ErrorCode.FORBIDDEN, HttpStatus.FORBIDDEN, message);
  }

  static notFound(entity = 'Resource') {
    return new AppError(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, `${entity} not found`);
  }

  static conflict(message: string) {
    return new AppError(ErrorCode.CONFLICT, HttpStatus.CONFLICT, message);
  }

  static rateLimited(retryAfterSeconds: number) {
    return new AppError(
      ErrorCode.RATE_LIMITED,
      HttpStatus.TOO_MANY_REQUESTS,
      'Too many requests, please try again later',
      undefined,
      retryAfterSeconds,
    );
  }
}
