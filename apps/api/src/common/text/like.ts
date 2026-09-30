/** Escapes LIKE/ILIKE wildcards so user search text is matched literally. */
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);
