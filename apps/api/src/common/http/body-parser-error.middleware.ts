import { HttpStatus } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCode } from '../errors/app-error.js';

const KNOWN: Record<string, { code: ErrorCode; status: HttpStatus; message: string }> = {
  'entity.parse.failed': {
    code: ErrorCode.BAD_REQUEST,
    status: HttpStatus.BAD_REQUEST,
    message: 'Malformed JSON body',
  },
  'entity.too.large': {
    code: ErrorCode.PAYLOAD_TOO_LARGE,
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    message: 'Request body is too large',
  },
  'encoding.unsupported': {
    code: ErrorCode.BAD_REQUEST,
    status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    message: 'Unsupported content encoding',
  },
};

/**
 * Registered right after the JSON parser. Converts parser failures into AppErrors with fixed
 * messages (never echoing parser internals); the global exception filter renders them.
 */
export function bodyParserErrorMiddleware(
  error: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const known = KNOWN[String((error as { type?: unknown })?.type)];
  next(known ? new AppError(known.code, known.status, known.message) : error);
}
