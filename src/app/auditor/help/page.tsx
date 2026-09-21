"use client";

import { HelpCircle, ShieldAlert } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";

const FAQS = [
  { q: "Why can't I see a company in Assigned Companies?", a: "You only see companies that Admin has explicitly assigned to you via Audit Assignments. If you're expecting a new assignment, contact your platform Admin." },
  { q: "Why don't I see a particular audit form?", a: "Audit forms are filtered by your assigned Auditor Role(s). If you need a new role (e.g. Water Audit Auditor), Admin has to add it to your profile." },
  { q: "I submitted an audit by mistake — can I edit it?", a: "Once submitted, an audit is locked. Ask Admin to \"Request Revision\" on it from the Audit Inbox, which will reopen it for editing." },
  { q: "How do I close a corrective action?", a: "Once the Employer submits evidence, it appears in Corrective Actions with an \"Accept & Close\" or \"Reopen\" option." },
  { q: "How is my credential validity extended?", a: "Credential validity, role assignment, and assessor number are all Admin-controlled and can only be changed by Admin." },
];

export default function AuditorHelpPage() {
  return (
    <PageTemplate title="Help & Support" subtitle="Guidance for using the Auditor portal" icon={HelpCircle}>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 max-w-2xl flex items-start gap-3">
        <ShieldAlert className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-blue-900">
          Role assignment, company assignment, and credential validity are all controlled by your platform Admin.
          For any change to these, reach out through your organization's registered Admin contact channel.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 max-w-2xl">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Frequently Asked Questions</h3>
        <div className="divide-y divide-gray-100">
          {FAQS.map((f) => (
            <details key={f.q} className="py-3 group">
              <summary className="text-sm font-medium text-gray-800 cursor-pointer list-none flex items-center justify-between">
                {f.q}
                <span className="text-gray-400 group-open:rotate-180 transition-transform">⌄</span>
              </summary>
              <p className="text-sm text-gray-500 mt-2">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </PageTemplate>
  );
}
