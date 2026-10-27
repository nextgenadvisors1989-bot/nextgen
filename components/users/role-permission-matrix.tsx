'use client';

/**
 * Admin → Permission Matrix.
 *
 * Every permission in the platform (module × action) against every role, with
 * the current grants loaded from `role_permissions`. A cell is a checkbox; a
 * column header toggles a whole role, a module header toggles a whole module
 * for every editable role. Nothing is written until Save, and Save sends only
 * the roles whose grants actually differ — the server replaces a role's grant
 * set wholesale and revokes the sessions of everyone holding it.
 */
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { formatNumber } from '@/lib/utils/formatting';
import { PERMISSION_ACTION_LABELS, moduleLabel } from '@/components/users/shared';

export interface MatrixRole {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  isSystemRole: boolean;
  permissions: number;
  users: number;
}

interface MatrixModule {
  module: string;
  permissions: { name: string; action: string; description: string | null }[];
}

export interface MatrixPayload {
  roles: MatrixRole[];
  modules: MatrixModule[];
  grants: Record<string, string[]>;
  defaults: Record<string, string[]>;
}

/** Super Administrator always holds everything; its column is informational. */
const LOCKED_ROLE = 'super_admin';

export function RolePermissionMatrix({ payload }: { payload: MatrixPayload }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error: errorToast } = useToast();

  const { roles, modules } = payload;
  const focusRole = searchParams.get('role');

  const initial = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const role of roles) map[role.slug] = new Set(payload.grants[role.slug] ?? []);
    return map;
  }, [roles, payload.grants]);

  const [grants, setGrants] = useState<Record<string, Set<string>>>(() => {
    const map: Record<string, Set<string>> = {};
    for (const role of roles) map[role.slug] = new Set(payload.grants[role.slug] ?? []);
    return map;
  });
  const [search, setSearch] = useState('');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const editableRoles = roles.filter((role) => role.slug !== LOCKED_ROLE);
  const visibleRoles = focusRole
    ? roles.filter((role) => role.slug === focusRole)
    : roles;

  const changedRoles = useMemo(
    () => roles.filter((role) => {
      if (role.slug === LOCKED_ROLE) return false;
      const before = initial[role.slug] ?? new Set<string>();
      const after = grants[role.slug] ?? new Set<string>();
      if (before.size !== after.size) return true;
      for (const name of before) if (!after.has(name)) return true;
      return false;
    }),
    [roles, initial, grants]
  );

  const visibleModules = useMemo(() => {
    const term = search.trim().toLowerCase();
    return modules
      .map((module) => ({
        ...module,
        permissions: module.permissions.filter((permission) =>
          !term || module.module.includes(term) || permission.action.includes(term) || permission.name.includes(term)
        ),
      }))
      .filter((module) => {
        if (!module.permissions.length) return false;
        if (!onlyChanged) return true;
        return changedRoles.some((role) => module.permissions.some((permission) => {
          const set = grants[role.slug];
          return set?.has(permission.name) !== (initial[role.slug]?.has(permission.name) ?? false);
        }));
      });
  }, [modules, search, onlyChanged, changedRoles, grants, initial]);

  const totalCells = modules.reduce((total, module) => total + module.permissions.length, 0);

  function toggle(roleSlug: string, permissionName: string) {
    setGrants((current) => {
      const next = { ...current };
      const set = new Set(next[roleSlug] ?? []);
      if (set.has(permissionName)) set.delete(permissionName);
      else set.add(permissionName);
      next[roleSlug] = set;
      return next;
    });
  }

  function toggleMany(roleSlug: string, permissionNames: string[], value: boolean) {
    setGrants((current) => {
      const next = { ...current };
      const set = new Set(next[roleSlug] ?? []);
      for (const name of permissionNames) {
        if (value) set.add(name);
        else set.delete(name);
      }
      next[roleSlug] = set;
      return next;
    });
  }

  function toggleModuleForAll(module: MatrixModule, value: boolean) {
    setGrants((current) => {
      const next = { ...current };
      for (const role of editableRoles) {
        const set = new Set(next[role.slug] ?? []);
        for (const permission of module.permissions) {
          if (value) set.add(permission.name);
          else set.delete(permission.name);
        }
        next[role.slug] = set;
      }
      return next;
    });
  }

  function resetToDefaults() {
    const next: Record<string, Set<string>> = {};
    for (const role of roles) {
      next[role.slug] = new Set(role.slug === LOCKED_ROLE ? (payload.grants[role.slug] ?? []) : (payload.defaults[role.slug] ?? []));
    }
    setGrants(next);
    setConfirmReset(false);
  }

  function discardChanges() {
    const next: Record<string, Set<string>> = {};
    for (const role of roles) next[role.slug] = new Set(initial[role.slug] ?? []);
    setGrants(next);
  }

  async function save() {
    if (!changedRoles.length) {
      errorToast('No changes to save');
      return;
    }
    setSaving(true);
    try {
      const result = await api.put('/api/admin/permissions/matrix', {
        roles: changedRoles.map((role) => ({
          role_slug: role.slug,
          permissions: [...(grants[role.slug] ?? new Set<string>())],
        })),
      });
      if (!result.ok) {
        errorToast(result.message);
        return;
      }
      success(result.message);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <Input
            placeholder="Filter by module, action or permission name…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-sm"
          />
          <label className="flex items-center gap-2 text-[13px] text-ink-soft">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-line"
              checked={onlyChanged}
              onChange={(event) => setOnlyChanged(event.target.checked)}
            />
            Show only changed modules
          </label>
          {focusRole && (
            <a href="/admin/permissions" className="text-[13px] text-brand-600 hover:underline">
              Showing only {focusRole} — show every role
            </a>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Badge tone={changedRoles.length ? 'warning' : 'slate'}>
              {changedRoles.length ? `${changedRoles.length} role(s) changed` : 'No unsaved changes'}
            </Badge>
            <Button size="sm" variant="outline" onClick={() => setConfirmReset(true)}>Reset to defaults</Button>
            <Button size="sm" variant="outline" onClick={discardChanges} disabled={!changedRoles.length}>Discard</Button>
            <Button size="sm" onClick={save} loading={saving} disabled={!changedRoles.length}>Save changes</Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="sticky top-0 z-10 bg-[#f8fafc]">
              <tr>
                <th className="table-head sticky left-0 z-10 bg-[#f8fafc] min-w-[240px]">Module &amp; action</th>
                {visibleRoles.map((role) => (
                  <th key={role.slug} className="table-head text-center">
                    <span className="block text-[13px] font-semibold text-ink">{role.name}</span>
                    <span className="mt-0.5 block text-[11px] font-normal text-ink-muted">
                      {role.slug === LOCKED_ROLE ? 'fixed' : `${role.permissions} granted · ${role.users} login(s)`}
                    </span>
                    {role.slug === LOCKED_ROLE ? (
                      <span className="mt-1 block text-[11px] text-ink-muted">Always super user</span>
                    ) : (
                      <span className="mt-1 flex items-center justify-center gap-1">
                        <button
                          type="button"
                          className="text-[11px] text-brand-600 hover:underline"
                          onClick={() => toggleMany(role.slug, modules.flatMap((module) => module.permissions.map((permission) => permission.name)), true)}
                        >
                          all
                        </button>
                        <span className="text-ink-muted">/</span>
                        <button
                          type="button"
                          className="text-[11px] text-ink-soft hover:underline"
                          onClick={() => toggleMany(role.slug, modules.flatMap((module) => module.permissions.map((permission) => permission.name)), false)}
                        >
                          none
                        </button>
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleModules.map((module) => (
                <ModuleRows
                  key={module.module}
                  module={module}
                  roles={visibleRoles}
                  grants={grants}
                  initial={initial}
                  onToggle={toggle}
                  onToggleModule={toggleModuleForAll}
                />
              ))}
              {!visibleModules.length && (
                <tr>
                  <td colSpan={visibleRoles.length + 1} className="px-4 py-10 text-center text-sm text-ink-muted">
                    No permissions match that filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-ink-muted">
          <span>
            {formatNumber(totalCells)} permissions across {modules.length} module(s) · {formatNumber(roles.length)} role(s)
          </span>
          <span>Saving a role replaces its grant set and signs out everyone holding it.</span>
        </div>
      </Card>

      <Card>
        <CardBody className="space-y-2">
          <h3 className="text-sm font-semibold text-ink">How the matrix works</h3>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-muted">
            <li>Every API route checks one of these names, so revoking a permission here removes the button and the endpoint at the same time.</li>
            <li>A login's effective permissions are the union of the roles it holds — a permission only needs to be granted once.</li>
            <li>Dashboard view access is never removed on its own: every panel needs its landing page to render.</li>
            <li>The Super Administrator column is fixed so the platform can always be administered.</li>
          </ul>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={resetToDefaults}
        title="Reset every role to platform defaults?"
        message="Cells change back to what the platform ships with. Nothing is written until you press Save changes."
        confirmLabel="Reset cells"
        variant="warning"
      />
    </div>
  );
}

function ModuleRows({
  module,
  roles,
  grants,
  initial,
  onToggle,
  onToggleModule,
}: {
  module: MatrixModule;
  roles: MatrixRole[];
  grants: Record<string, Set<string>>;
  initial: Record<string, Set<string>>;
  onToggle: (roleSlug: string, permissionName: string) => void;
  onToggleModule: (module: MatrixModule, value: boolean) => void;
}) {
  const names = module.permissions.map((permission) => permission.name);
  const allGranted = roles
    .filter((role) => role.slug !== LOCKED_ROLE)
    .every((role) => names.every((name) => grants[role.slug]?.has(name)));

  return (
    <>
      <tr className="bg-surface-muted/60">
        <td className="sticky left-0 z-[1] bg-surface-muted/60 px-4 py-2">
          <span className="text-[13px] font-semibold text-ink">{moduleLabel(module.module)}</span>
          <button
            type="button"
            className="ml-3 text-[11px] text-brand-600 hover:underline"
            onClick={() => onToggleModule(module, !allGranted)}
            title="Grant or revoke this whole module for every editable role"
          >
            {allGranted ? 'revoke module' : 'grant module'}
          </button>
        </td>
        {roles.map((role) => {
          const granted = names.filter((name) => grants[role.slug]?.has(name)).length;
          return (
            <td key={role.slug} className="px-3 py-2 text-center text-[11px] text-ink-muted">
              {role.slug === LOCKED_ROLE ? '—' : `${granted}/${names.length}`}
            </td>
          );
        })}
      </tr>
      {module.permissions.map((permission) => (
        <tr key={permission.name} className="border-b border-line last:border-0 hover:bg-[#f8fafc]">
          <td className="sticky left-0 z-[1] bg-white px-4 py-2">
            <span className="text-[13px] text-ink">{PERMISSION_ACTION_LABELS[permission.action] ?? permission.action}</span>
            <span className="ml-2 font-mono text-[11px] text-ink-muted">{permission.name}</span>
          </td>
          {roles.map((role) => {
            const checked = role.slug === LOCKED_ROLE ? true : Boolean(grants[role.slug]?.has(permission.name));
            const changed = role.slug !== LOCKED_ROLE
              && checked !== Boolean(initial[role.slug]?.has(permission.name));
            return (
              <td key={role.slug} className="px-3 py-2 text-center">
                <label
                  title={changed ? 'Unsaved change' : undefined}
                  className={`inline-flex h-5 w-5 items-center justify-center rounded border ${
                    changed ? 'border-amber-400 bg-amber-50' : 'border-line'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-line disabled:opacity-60"
                    checked={checked}
                    disabled={role.slug === LOCKED_ROLE}
                    aria-label={`${permission.name} for ${role.name}`}
                    onChange={() => onToggle(role.slug, permission.name)}
                  />
                </label>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
