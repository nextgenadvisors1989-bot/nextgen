import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { UserForm } from '@/components/users/user-form';
import { getUserDetail } from '@/services/user.service';

export const metadata: Metadata = { title: 'Edit User' };
export const dynamic = 'force-dynamic';

export default async function EditUserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  await requirePanel(['admin', 'super_admin']);

  let detail;
  try {
    detail = await getUserDetail(id);
  } catch {
    notFound();
  }

  const user = detail.user;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit ${user.first_name} ${user.last_name}`}
        description={String(user.email)}
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Users', href: '/admin/users' },
          { label: `${user.first_name} ${user.last_name}`, href: `/admin/users/${id}` },
          { label: 'Edit' },
        ]}
      />
      <UserForm
        mode="edit"
        userId={id}
        roleOptions={[]}
        initialValues={{
          first_name: String(user.first_name),
          last_name: String(user.last_name),
          email: String(user.email),
          username: String(user.username),
          mobile: String(user.mobile ?? ''),
          role_slugs: String(user.role_slugs ?? '').split('|').filter(Boolean),
          status: String(user.status) as 'active' | 'inactive' | 'suspended',
          send_credentials: false,
          password: '',
          set_password: false,
          employer_id: '',
          auditor_id: '',
          employee_id: '',
        }}
      />
    </div>
  );
}
