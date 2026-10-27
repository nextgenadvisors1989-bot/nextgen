import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePanel, hasPermission } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { UserDetail, type UserDetailPayload } from '@/components/users/user-detail';
import { getUserDetail, listRoles } from '@/services/user.service';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ userId: string }> }): Promise<Metadata> {
  const { userId } = await params;
  try {
    const detail = await getUserDetail(Number(userId));
    return { title: `${detail.user.first_name} ${detail.user.last_name}` };
  } catch {
    return { title: 'User' };
  }
}

export default async function UserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const actor = await requirePanel(['admin', 'super_admin']);

  let payload: UserDetailPayload;
  let roleOptions: { value: string; label: string; description?: string }[];
  try {
    const [detail, roles] = await Promise.all([
      getUserDetail(id),
      listRoles({ page: 1, limit: 200, search: null, sortBy: null, sortDir: 'asc', kind: 'all' }),
    ]);
    payload = JSON.parse(JSON.stringify(detail)) as UserDetailPayload;
    roleOptions = roles.data.map((role) => ({
      value: String(role.slug),
      label: String(role.name),
      description: String(role.description ?? `${role.permissions} permission(s)`),
    }));
  } catch {
    notFound();
  }

  const name = `${payload.user.first_name} ${payload.user.last_name}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title={name}
        description={payload.user.email}
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Users', href: '/admin/users' },
          { label: name },
        ]}
        actions={
          <Link href="/admin/users" className="text-[13px] text-brand-600 hover:underline">Back to register</Link>
        }
      />
      <UserDetail
        payload={payload}
        roleOptions={roleOptions}
        canEdit={hasPermission(actor.permissions, 'user.update')}
        canDelete={hasPermission(actor.permissions, 'user.delete')}
      />
    </div>
  );
}
