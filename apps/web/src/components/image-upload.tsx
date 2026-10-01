'use client';

import { useRef, useState } from 'react';
import { api, errorMessage } from '@/lib/api';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif';
const MAX_BYTES = 8 * 1024 * 1024;

/** Uploads one image (multipart field "file") to `path`, then calls onUploaded. */
export function ImageUpload({
  path,
  label,
  onUploaded,
  disabled,
}: {
  path: string;
  label: string;
  onUploaded: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError('The photo is larger than 8 MB.');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await api(path, { method: 'POST', form });
      await onUploaded();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        className="btn-secondary"
        disabled={busy || disabled}
        onClick={() => input.current?.click()}
      >
        {busy ? 'Uploading…' : label}
      </button>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
