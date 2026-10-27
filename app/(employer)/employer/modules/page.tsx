import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { ModuleCatalogue, type AvailableModule } from '@/components/auditor/module-catalogue';
import { availableModules } from '@/services/dynamic-module.service';
import { actorFromUser, listSubmissions, submissionStats } from '@/services/dynamic-submission.service';

export const metadata: Metadata = { title: 'Modules & Forms' };
export const dynamic = 'force-dynamic';

export default async function EmployerModulesPage() {
  const user = await requirePanel(['employer']);
  const actor = actorFromUser(user);

  const [modules, stats, drafts] = await Promise.all([
    availableModules(user.id, user.primaryRole),
    submissionStats(actor),
    listSubmissions(actor, { status: 'draft', limit: 5, page: 1, sortBy: 'updated_at', sortDir: 'desc' }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modules & Forms"
        description="Assessments, risk registers, studies and permits your administrator has opened to your establishment. Starting a form opens a submission; drafts resume exactly where you left them."
        breadcrumbs={[{ label: 'Dashboard', href: '/employer/dashboard' }, { label: 'Modules & Forms' }]}
      />
      <ModuleCatalogue
        panel="employer"
        modules={modules as unknown as AvailableModule[]}
        stats={stats}
        drafts={drafts.data.map((row) => ({
          id: Number(row.id),
          submission_number: String(row.submission_number),
          title: row.title === null ? null : String(row.title),
          module_name: String(row.module_name),
          form_name: String(row.form_name),
          updated_at: String(row.updated_at),
        }))}
      />
    </div>
  );
}
