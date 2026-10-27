'use client';

/**
 * Admin → Roles → one role.
 *
 * Shows the role's grant set as an editable picker (saving replaces the set and
 * signs out every member), the members who hold it, and — for custom roles — the
 * rename/delete controls.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardBody } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable, type Column } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { formatNumber } from '@/lib/utils/formatting';
import { DetailRow, UserStatusBadge, type RoleRow } from '@/components/users/shared';
import { PermissionPicker, groupCatalogue, type CatalogueModule } from '@/components/users/permission-picker';

export interface RoleMember {
  id: number;
  name: string;
  email: string;
  username: string;
  status: 'active' | 'inactive' | 'suspended';
  last_login_at: string | null;
  assigned_at: string;
}

export function RoleDetail({
  role,
  permissionNames,
  members,
  catalogue,
  defaults,
  canEdit,
  canDelete,
}: {
  role: RoleRow;
  permissionNames: string[];
  members: RoleMember[];
  catalogue: { id: number; name: string; module: string; action: string; description: string | null }[];
  defaults: string[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const isSystem = Boolean(role.is_system_role);

  const [selected, setSelected] = useState<string[]>(permissionNames);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({ name: role.name, description: role.description ?? '' });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  const modules: CatalogueModule[] = groupCatalogue(catalogue);

  const added = selected.filter((name) => !permissionNames.includes(name));
  const removed = permissionNames.filter((name) => !selected.includes(name));
  const dirty = added.length > 0 || removed.length > 0;

  async function savePermissions() {
    setSaving(true);
    try {
      const result = await api.put(`/api/admin/roles/${role.id}/permissions`, { permissions: selected });
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

  async function saveProfile() {
    setSavingProfile(true);
    setProfileErrors({});
    try {
      const result = await api.patch(`/api/admin/roles/${role.id}`, {
        name: profile.name,
        description: profile.description || null,
      });
      if (!result.ok) {
        setProfileErrors(fieldErrors(result));
        errorToast(result.message);
        return;
      }
      success(result.message);
      router.refresh();
    } finally {
      setSavingProfile(false);
    }
  }

  async function deleteRole() {
    setSavingProfile(true);
    try {
      const result = await api.delete(`/api/admin/roles/${role.id}`);
      if (!result.ok) {
        errorToast(result.message);
        return;
      }
      success(result.message);
      router.push('/admin/roles');
      router.refresh();
    } finally {
      setSavingProfile(false);
      setPendingDelete(false);
    }
  }

  const memberColumns: Column<RoleMember>[] = [
    {
      key: 'name',
      header: 'Account',
      render: (row) => (
        <div>
          <Link href={`/admin/users/${row.id}`} className="text-sm font-medium text-ink hover:text-brand-600">{row.name}</Link>
          <p className="text-[12px] text-ink-muted">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <UserStatusBadge user={{ status: row.status, locked_until: null, is_locked: 0, deleted_at: null }} />,
    },
    {
      key: 'last_login_at',
      header: 'Last sign-in',
      hideOnMobile: true,
      render: (row) => <span className="text-[13px] text-ink-muted">{row.last_login_at ? formatDateTime(row.last_login_at) : 'Never'}</span>,
    },
    {
      key: 'assigned_at',
      header: 'Assigned',
      hideOnMobile: true,
      render: (row) => <span className="text-[13px] text-ink-muted">{formatDate(row.assigned_at)}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-ink">{role.name}</h2>
                <Badge tone={isSystem ? 'brand' : 'slate'}>{isSystem ? 'System role' : 'Custom role'}</Badge>
              </div>
              <p className="mt-1 font-mono text-[13px] text-ink-muted">{role.slug}</p>
              <p className="mt-1 max-w-2xl text-sm text-ink-soft">{role.description ?? 'No description recorded.'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LinkButton href="/admin/roles" variant="ghost" size="sm">Back to roles</LinkButton>
              <LinkButton href={`/admin/permissions?role=${role.slug}`} variant="outline" size="sm">Open in matrix</LinkButton>
              {canDelete && !isSystem && (
                <Button size="sm" variant="danger" onClick={() => setPendingDelete(true)}>Delete role</Button>
              )}
            </div>
          </div>

          <dl className="grid gap-x-8 sm:grid-cols-2">
            <DetailRow label="Logins holding it">
              <Link href={`/admin/users?role=${role.slug}`} className="text-brand-600 hover:underline">
                {formatNumber(role.users)}
              </Link>
            </DetailRow>
            <DetailRow label="Permissions granted">{formatNumber(role.permissions)}</DetailRow>
            <DetailRow label="Platform default">{formatNumber(defaults.length)} permission(s)</DetailRow>
            <DetailRow label="Created">{formatDateTime(role.created_at)}</DetailRow>
          </dl>
        </CardBody>
      </Card>

      <Tabs
        items={[
          {
            key: 'permissions',
            label: 'Permissions',
            badge: <Badge tone={dirty ? 'warning' : 'slate'}>{selected.length}</Badge>,
            content: (
              <Card>
                <CardBody className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-ink">What this role may do</h3>
                      <p className="mt-1 text-[13px] text-ink-muted">
                        {isSystem
                          ? 'System roles can be tuned, but their slug and name are fixed.'
                          : 'Saving replaces the role\'s grants and signs out every member so the change takes effect immediately.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {dirty && (
                        <span className="text-[12px] text-amber-600">
                          {added.length} to grant · {removed.length} to revoke
                        </span>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setSelected(permissionNames)} disabled={!dirty}>Discard</Button>
                      <Button size="sm" variant="outline" onClick={() => setSelected(defaults)} disabled={isSystem}>Use platform defaults</Button>
                      <Button size="sm" onClick={savePermissions} loading={saving} disabled={!dirty || !canEdit}>
                        Save permissions
                      </Button>
                    </div>
                  </div>

                  <PermissionPicker
                    modules={modules}
                    selected={selected}
                    onChange={setSelected}
                    readOnly={!canEdit}
                    emptyHint="The permission catalogue is empty — run the seeds."
                  />
                </CardBody>
              </Card>
            ),
          },
          {
            key: 'members',
            label: 'Members',
            badge: <Badge tone="slate">{members.length}</Badge>,
            content: (
              <Card padded={false}>
                <div className="border-b border-line px-4 py-3">
                  <h3 className="text-sm font-semibold text-ink">Logins holding this role</h3>
                  <p className="mt-1 text-[13px] text-ink-muted">
                    Reassign a login from its account detail screen; changes are recorded in the audit trail.
                  </p>
                </div>
                <DataTable
                  columns={memberColumns}
                  data={members}
                  rowKey={(row) => row.id}
                  emptyTitle="Nobody holds this role yet"
                  emptySubtitle="Assign it from a user's account detail screen."
                  emptyAction={<LinkButton href="/admin/users" size="sm">Open the register</LinkButton>}
                />
              </Card>
            ),
          },
          {
            key: 'settings',
            label: 'Settings',
            content: (
              <Card>
                <CardBody className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Role details</h3>
                    <p className="mt-1 text-[13px] text-ink-muted">
                      {isSystem
                        ? 'System role names are fixed because panel routing and permission defaults key off them.'
                        : 'Rename the role or sharpen its purpose. The slug stays as created so nothing referencing it breaks.'}
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label="Role name" value={profile.name} disabled={isSystem || !canEdit}
                      onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))}
                      error={profileErrors.name}
                    />
                    <Input
                      label="Slug" value={role.slug} disabled
                      helper="Immutable — it is referenced by panel routing and permission guards."
                    />
                    <div className="sm:col-span-2">
                      <Input
                        label="Purpose" value={profile.description} disabled={!canEdit}
                        onChange={(event) => setProfile((current) => ({ ...current, description: event.target.value }))}
                        error={profileErrors.description}
                        placeholder="What this role exists for"
                      />
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setProfile({ name: role.name, description: role.description ?? '' })}
                        disabled={profile.name === role.name && profile.description === (role.description ?? '')}
                      >
                        Reset
                      </Button>
                      <Button
                        onClick={saveProfile}
                        loading={savingProfile}
                        disabled={isSystem || (profile.name === role.name && profile.description === (role.description ?? ''))}
                      >
                        Save details
                      </Button>
                    </div>
                  )}
                </CardBody>
              </Card>
            ),
          },
        ]}
      />

      <ConfirmDialog
        open={pendingDelete}
        onClose={() => setPendingDelete(false)}
        onConfirm={deleteRole}
        title={`Delete ${role.name}?`}
        message="The role is removed from the register. Logins still holding it must be moved to another role first."
        confirmLabel="Delete role"
        loading={savingProfile}
      />
    </div>
  );
}
