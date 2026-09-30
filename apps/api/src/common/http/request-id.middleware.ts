import type { NextFunction, Request, Response } from 'express';
import { v7 as uuidv7 } from 'uuid';

/** Accept a caller-supplied request id only if it is short and safe to log. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * First middleware in the chain: every request (even one rejected by the JSON parser)
 * gets an id that appears in logs, the X-Request-Id header and error bodies.
 */
export function requestIdMiddleware(req: Request & { id?: string }, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : uuidv7();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
