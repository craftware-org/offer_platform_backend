'use client';

import { useCallback, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { api, errorMessage } from '@/lib/api';

interface AdminCategory {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}
interface AdminCategoryNode extends AdminCategory {
  children: AdminCategory[];
}

export default function AdminCategoriesPage() {
  return (
    <RequireAuth permission="categories:manage">
      <Categories />
    </RequireAuth>
  );
}

function Categories() {
  const [tree, setTree] = useState<AdminCategoryNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setTree(await api<AdminCategoryNode[]>('/admin/categories'));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /** Swap a category with its neighbour among its siblings and save the new order. */
  const move = (siblings: AdminCategory[], index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= siblings.length) return;
    const ids = siblings.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void run(() => api('/admin/categories/order', { method: 'PUT', body: { parentId: siblings[0]!.parentId, orderedIds: ids } }));
  };

  const row = (c: AdminCategory, siblings: AdminCategory[], index: number) => (
    <CategoryRow
      key={c.id}
      category={c}
      busy={busy}
      canUp={index > 0}
      canDown={index < siblings.length - 1}
      onMove={(d) => move(siblings, index, d)}
      onSave={(patch) => run(() => api(`/admin/categories/${c.id}`, { method: 'PATCH', body: patch }))}
    />
  );

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Categories</h1>
      <p className="text-sm text-gray-600">
        Hidden categories disappear from the website and from the business forms, but existing businesses and offers keep
        them. Nothing is ever deleted.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!tree && !error && <p className="text-sm text-gray-500">Loading…</p>}
      {tree?.map((parent, i) => (
        <section key={parent.id} className="card space-y-2">
          {row(parent, tree, i)}
          <div className="ml-6 space-y-1 border-l border-gray-200 pl-4">
            {parent.children.map((child, j) => row(child, parent.children, j))}
            <AddCategory label="Add subcategory" busy={busy} onAdd={(name) => run(() => api('/admin/categories', { method: 'POST', body: { name, parentId: parent.id } }))} />
          </div>
        </section>
      ))}
      {tree && (
        <section className="card">
          <AddCategory label="Add top-level category" busy={busy} onAdd={(name) => run(() => api('/admin/categories', { method: 'POST', body: { name, parentId: null } }))} />
        </section>
      )}
    </div>
  );
}

function CategoryRow({
  category: c,
  busy,
  canUp,
  canDown,
  onMove,
  onSave,
}: {
  category: AdminCategory;
  busy: boolean;
  canUp: boolean;
  canDown: boolean;
  onMove: (delta: -1 | 1) => void;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {editing ? (
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void onSave({ name: name.trim() }).then(() => setEditing(false));
          }}
        >
          <input className="input" aria-label="Category name" minLength={2} maxLength={80} required value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn-primary py-1.5" disabled={busy}>
            Save
          </button>
          <button type="button" className="btn-secondary py-1.5" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <span className={`flex-1 ${c.parentId ? '' : 'font-semibold'} ${c.isActive ? '' : 'text-gray-400 line-through'}`}>
            {c.name} <span className="text-xs font-normal text-gray-400">/{c.slug}</span>
          </span>
          {!c.isActive && <span className="badge bg-gray-100 text-gray-600">hidden</span>}
          <button className="btn-secondary px-2 py-1" disabled={busy || !canUp} onClick={() => onMove(-1)} aria-label={`Move ${c.name} up`}>
            ↑
          </button>
          <button className="btn-secondary px-2 py-1" disabled={busy || !canDown} onClick={() => onMove(1)} aria-label={`Move ${c.name} down`}>
            ↓
          </button>
          <button className="btn-secondary py-1" disabled={busy} onClick={() => setEditing(true)}>
            Rename
          </button>
          <button className="btn-secondary py-1" disabled={busy} onClick={() => void onSave({ isActive: !c.isActive })}>
            {c.isActive ? 'Hide' : 'Show'}
          </button>
        </>
      )}
    </div>
  );
}

function AddCategory({ label, busy, onAdd }: { label: string; busy: boolean; onAdd: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  return (
    <form
      className="flex gap-2 pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        void onAdd(name.trim()).then(() => setName(''));
      }}
    >
      <input className="input" placeholder={label} aria-label={label} minLength={2} maxLength={80} required value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn-secondary whitespace-nowrap" disabled={busy || name.trim().length < 2}>
        Add
      </button>
    </form>
  );
}
