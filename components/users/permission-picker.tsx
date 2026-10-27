'use client';

/**
 * Grouped permission picker — modules as sections, actions as checkboxes.
 *
 * Used by the role create form and by the role detail editor. It is controlled:
 * it renders the selection it is given and hands back a new `string[]`.
 */
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PERMISSION_ACTION_LABELS, moduleLabel } from '@/components/users/shared';

export interface CatalogueModule {
  module: string;
  permissions: { name: string; action: string; description: string | null }[];
}

export function groupCatalogue(
  catalogue: { name: string; module: string; action: string; description: string | null }[]
): CatalogueModule[] {
  const modules = new Map<string, CatalogueModule>();
  for (const permission of catalogue) {
    if (!modules.has(permission.module)) modules.set(permission.module, { module: permission.module, permissions: [] });
    modules.get(permission.module)!.permissions.push({
      name: permission.name,
      action: permission.action,
      description: permission.description,
    });
  }
  return [...modules.values()];
}

export function PermissionPicker({
  modules,
  selected,
  onChange,
  readOnly,
  emptyHint = 'No permissions match that filter.',
}: {
  modules: CatalogueModule[];
  selected: string[];
  onChange: (next: string[]) => void;
  readOnly?: boolean;
  emptyHint?: string;
}) {
  const [search, setSearch] = useState('');
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return modules;
    return modules
      .map((module) => ({
        ...module,
        permissions: module.permissions.filter((permission) =>
          module.module.includes(term) || permission.action.includes(term) || permission.name.includes(term)
        ),
      }))
      .filter((module) => module.permissions.length > 0);
  }, [modules, search]);

  const toggle = (name: string) => {
    if (readOnly) return;
    onChange(selectedSet.has(name) ? selected.filter((entry) => entry !== name) : [...selected, name]);
  };

  const toggleModule = (module: CatalogueModule, value: boolean) => {
    if (readOnly) return;
    const names = module.permissions.map((permission) => permission.name);
    const next = new Set(selected);
    for (const name of names) {
      if (value) next.add(name);
      else next.delete(name);
    }
    onChange([...next]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Filter modules, actions or permission names…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-sm"
        />
        <Badge tone={selected.length ? 'brand' : 'slate'}>{selected.length} selected</Badge>
        {!readOnly && (
          <div className="ml-auto flex items-center gap-3 text-[12px]">
            <button type="button" className="text-brand-600 hover:underline" onClick={() => onChange(modules.flatMap((m) => m.permissions.map((p) => p.name)))}>
              Select every permission
            </button>
            <button type="button" className="text-ink-soft hover:underline" onClick={() => onChange([])}>
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {visible.map((module) => {
          const names = module.permissions.map((permission) => permission.name);
          const granted = names.filter((name) => selectedSet.has(name)).length;
          const all = granted === names.length;
          return (
            <div key={module.module} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[13px] font-semibold text-ink">{moduleLabel(module.module)}</p>
                  <p className="text-[11px] text-ink-muted">{granted}/{names.length} granted</p>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    className="text-[11px] text-brand-600 hover:underline"
                    onClick={() => toggleModule(module, !all)}
                  >
                    {all ? 'clear module' : 'grant module'}
                  </button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {module.permissions.map((permission) => {
                  const checked = selectedSet.has(permission.name);
                  return (
                    <button
                      key={permission.name}
                      type="button"
                      disabled={readOnly}
                      title={permission.name}
                      onClick={() => toggle(permission.name)}
                      className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                        checked
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-line bg-white text-ink-soft hover:bg-surface-muted'
                      } ${readOnly ? 'cursor-not-allowed opacity-70' : ''}`}
                    >
                      {PERMISSION_ACTION_LABELS[permission.action] ?? permission.action}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!visible.length && <p className="text-[13px] text-ink-muted">{emptyHint}</p>}
      </div>
    </div>
  );
}
