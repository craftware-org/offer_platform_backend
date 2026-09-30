import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { map, type Observable } from 'rxjs';
import { Page } from './pagination.js';

/**
 * Wraps controller results in the success envelope: { success: true, data, meta? }.
 * `Page` results put their pagination info in `meta`. 204 responses stay empty and
 * files (StreamableFile, e.g. images) are sent as-is.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((result: unknown) => {
        if (result instanceof StreamableFile) return result;
        if (res.statusCode === 204) return undefined;
        if (result instanceof Page) return { success: true, data: result.items, meta: result.meta };
        return { success: true, data: result ?? null };
      }),
    );
  }
}
