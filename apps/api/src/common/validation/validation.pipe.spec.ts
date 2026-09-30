import { z } from 'zod';
import { AppError } from '../errors/app-error.js';
import { createValidationPipe, issuesToFields } from './validation.pipe.js';

describe('issuesToFields', () => {
  it('maps nested paths to dotted keys and keeps the first message per field', () => {
    const schema = z.object({ items: z.array(z.object({ price: z.number().min(0) })), name: z.string() });
    const result = schema.safeParse({ items: [{ price: -1 }], name: 5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = issuesToFields(result.error.issues);
      expect(Object.keys(fields).sort()).toEqual(['items.0.price', 'name']);
    }
  });
});

describe('validation pipe', () => {
  const pipe = createValidationPipe();

  it('returns the parsed (transformed) value', async () => {
    const schema = z.object({ page: z.coerce.number().default(1) });
    await expect(pipe.transform({}, { type: 'query', schema } as never)).resolves.toEqual({ page: 1 });
  });

  it('reports a single named parameter under its own name', async () => {
    await expect(
      pipe.transform('nope', { type: 'param', data: 'id', schema: z.uuid() } as never),
    ).rejects.toMatchObject({ fields: { id: expect.any(String) } });
  });

  it('throws AppError VALIDATION_ERROR', async () => {
    const schema = z.strictObject({ a: z.string() });
    await expect(
      pipe.transform({ a: 'x', extra: 1 }, { type: 'body', schema } as never),
    ).rejects.toBeInstanceOf(AppError);
  });
});
