import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { getEmployeeDashboardData } from '@/services/dashboard.service';
import { EmployeeDashboard } from '@/components/dashboards/employee-dashboard';
import { Card, CardBody } from '@/components/ui/card';

export const metadata: Metadata = { title: 'My Dashboard' };
export const dynamic = 'force-dynamic';

export default async function EmployeeDashboardPage() {
  const user = await requirePageUser();

  // An employee-panel login that has not yet been linked to an employee record
  // still gets a usable screen rather than an error.
  if (!user.employeeId) {
    return (
      <Card>
        <CardBody className="space-y-2">
          <h1 className="page-title">Your profile is being set up</h1>
          <p className="text-sm text-ink-muted">
            This login is not linked to an employee record yet. Your employer&rsquo;s HR administrator
            completes the link when your onboarding record is created — you will receive an email as soon
            as your profile, payslips and documents are available.
          </p>
          <p className="text-sm text-ink-muted">
            Need help now? Contact your HR department quoting your employee number.
          </p>
        </CardBody>
      </Card>
    );
  }

  const data = await getEmployeeDashboardData(user.employeeId, user.employerId ?? 0);
  return <EmployeeDashboard data={data} userName={user.fullName} />;
}
