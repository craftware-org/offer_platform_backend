'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { CategoryNode } from '@/lib/types';

export function CategorySelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [tree, setTree] = useState<CategoryNode[]>([]);
  useEffect(() => {
    api<CategoryNode[]>('/categories', { auth: false })
      .then(setTree)
      .catch(() => setTree([]));
  }, []);
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} required>
      <option value="">Choose a category…</option>
      {tree.map((parent) => (
        <optgroup key={parent.id} label={parent.name}>
          <option value={parent.id}>{parent.name} (general)</option>
          {parent.children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
