import { StandardSchemaValidationPipe, type ArgumentMetadata } from '@nestjs/common';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { AppError, type FieldErrors } from '../errors/app-error.js';

const ROOT = '_root';

/** Turns schema issues into `{ "phone": "Invalid phone number", "items.0.price": "..." }`. */
export function issuesToFields(issues: readonly StandardSchemaV1.Issue[]): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of issues) {
    const key =
      (issue.path ?? [])
        .map((segment) => (typeof segment === 'object' ? segment.key : segment))
        .map(String)
        .join('.') || ROOT;
    fields[key] ??= issue.message;
  }
  return fields;
}

/**
 * Global validation: every @Body/@Query/@Param that declares `{ schema }` is validated
 * (and transformed) by its Zod schema. Failures become VALIDATION_ERROR with per-field messages.
 * For a single named value such as @Param('id'), the error is reported under that name.
 */
class AppValidationPipe extends StandardSchemaValidationPipe {
  override async transform<T = unknown>(value: T, metadata: ArgumentMetadata): Promise<T> {
    try {
      return await super.transform(value, metadata);
    } catch (error) {
      const name = metadata.data;
      if (error instanceof AppError && name && error.fields?.[ROOT] !== undefined) {
        const { [ROOT]: message, ...rest } = error.fields;
        throw AppError.validation({ [name]: message, ...rest });
      }
      throw error;
    }
  }
}

export function createValidationPipe() {
  return new AppValidationPipe({
    exceptionFactory: (issues) => AppError.validation(issuesToFields(issues)),
  });
}
