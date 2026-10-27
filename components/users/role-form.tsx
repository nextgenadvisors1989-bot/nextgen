'use client';

/**
 * Create / edit a role.
 *
 * Create mode is the full provisioning flow: name, slug, purpose, an optional
 * clone of an existing role's grants, and the permission picker. Edit mode
 * renames a custom role — the slug is immutable because panel routing and
 * permission guards resolve roles by slug.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardFooter } from '@/components/ui/card';
import { Button, LinkButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { PermissionPicker, groupCatalogue, type CatalogueModule } from '@/components/users/permission-picker';
import type { PermissionEntry } from '@/components/users/shared';

export function RoleForm({
  mode,
  roleId,
  roleOptions,
  catalogue,
  initialValues,
  initialPermissions = [],
  isSystemRole = false,
}: {
  mode: 'create' | 'edit';
  roleId?: number;
  roleOptions: { slug: string; name: string; permissions: number }[];
  catalogue: PermissionEntry[];
  initialValues?: { name: string; slug: string; description: string };
  initialPermissions?: string[];
  isSystemRole?: boolean;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [values, setValues] = useState(initialValues ?? { name: '', slug: '', description: '' });
  const [cloneFrom, setCloneFrom] = useState('');
  const [selected, setSelected] = useState<string[]>(initialPermissions);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const modules: CatalogueModule[] = groupCatalogue(catalogue);

  async function submit() {
    setSaving(true);
    setErrors({});
    try {
      if (mode === 'create') {
        const result = await api.post<{ roleId: number; name: string }>('/api/admin/roles', {
          name: values.name,
          ...(values.slug ? { slug: values.slug } : {}),
          ...(values.description ? { description: values.description } : {}),
          ...(cloneFrom ? { clone_from: cloneFrom } : {}),
          permissions: selected,
        });
        if (!result.ok) {
          setErrors(fieldErrors(result));
          errorToast(result.message);
          return;
        }
        success(result.message);
        router.push(`/admin/roles/${result.data?.roleId}`);
        router.refresh();
        return;
      }

      const result = await api.patch(`/api/admin/roles/${roleId}`, {
        name: values.name,
        description: values.description || null,
      });
      if (!result.ok) {
        setErrors(fieldErrors(result));
        errorToast(result.message);
        return;
      }
      success(result.message);
      router.push(`/admin/roles/${roleId}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="space-y-4">
          <div>
            <h2 className="section-title">Role details</h2>
            <p className="mt-1 text-[13px] text-ink-muted">
              {mode === 'create'
                ? 'Name the role the way the business speaks about it — “Payroll Officer”, “Safety Inspector”.'
                : 'The slug stays as created so nothing that references the role breaks.'}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Role name" required value={values.name} error={errors.name}
              placeholder="e.g. Payroll Officer"
              onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
            />
            <Input
              label="Slug" value={values.slug} error={errors.slug} disabled={mode === 'edit'}
              placeholder="payroll_officer"
              helper={mode === 'create'
                ? 'Lowercase letters, numbers and underscores. Generated from the name when left blank.'
                : 'Immutable — permission guards reference this slug.'}
              onChange={(event) => setValues((current) => ({ ...current, slug: event.target.value }))}
            />
            <div className="sm:col-span-2">
              <Input
                label="Purpose" value={values.description} error={errors.description}
                placeholder="Runs monthly payroll, exports payslips and manages salary structures"
                onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
              />
            </div>
            {mode === 'create' && (
              <div>
                <label className="label" htmlFor="clone-from">Clone permissions from</label>
                <select
                  id="clone-from"
                  className="input"
                  value={cloneFrom}
                  onChange={(event) => {
                    const slug = event.target.value;
                    setCloneFrom(slug);
                    const source = roleOptions.find((role) => role.slug === slug);
                    if (source) success(`${source.name} has ${source.permissions} permission(s) — they will be granted, then you can adjust below.`);
                  }}
                >
                  <option value="">Start from nothing</option>
                  {roleOptions.map((role) => (
                    <option key={role.slug} value={role.slug}>{role.name} ({role.permissions})</option>
                  ))}
                </select>
                <p className="mt-1 text-[12px] text-ink-muted">
                  Cloned grants are applied on save, together with anything you pick below.
                </p>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {mode === 'create' && (
        <Card>
          <CardBody className="space-y-4">
            <div>
              <h2 className="section-title">Permissions</h2>
              <p className="mt-1 text-[13px] text-ink-muted">
                Pick what the role may do now, or leave it empty and grant everything from the matrix later.
              </p>
            </div>
            <PermissionPicker modules={modules} selected={selected} onChange={setSelected} />
          </CardBody>
          <CardFooter className="flex items-center justify-between gap-3 border-t border-line pt-4">
            <span className="text-[12px] text-ink-muted">{selected.length} permission(s) selected</span>
            <div className="flex items-center gap-3">
              <LinkButton href="/admin/roles" variant="outline">Cancel</LinkButton>
              <Button onClick={submit} loading={saving}>Create role</Button>
            </div>
          </CardFooter>
        </Card>
      )}

      {mode === 'edit' && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <LinkButton href={`/admin/roles/${roleId}`} variant="outline">Cancel</LinkButton>
          <Button onClick={submit} loading={saving} disabled={isSystemRole}>Save changes</Button>
        </div>
      )}
    </div>
  );
}
