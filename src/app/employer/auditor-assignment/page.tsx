"use client";

import { useEffect, useState, useCallback } from "react";
import { UserCheck } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface Assignment {
  id: number; auditorId: number; startDate: string | null; endDate: string | null; isActive: boolean;
  auditorFirstName: string; auditorLastName: string | null; organization: string | null; assessorNumber: string | null;
  roles: string[]; completedAudits: number; upcomingAuditDate: string | null;
}

export default function EmployerAuditorAssignmentPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/employer/auditor-assignments");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.assignments);
    } catch (err) {
      toast.error("Failed to load auditor assignments", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return (
    <PageTemplate title="Auditor Assignment" subtitle="Auditors assigned to your company by Admin" icon={UserCheck}>
      <DataTable<Assignment>
        columns={[
          { key: "auditor", header: "Auditor", render: (r) => `${r.auditorFirstName} ${r.auditorLastName || ""}` },
          { key: "organization", header: "Organization", render: (r) => r.organization || "-" },
          { key: "roles", header: "Roles", render: (r) => (
            <div className="flex flex-wrap gap-1">
              {r.roles.map((role) => <span key={role} className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{role}</span>)}
            </div>
          ) },
          { key: "validity", header: "Validity", render: (r) => `${formatDate(r.startDate)} — ${formatDate(r.endDate)}` },
          { key: "completedAudits", header: "Completed Audits" },
          { key: "upcomingAuditDate", header: "Upcoming Audit", render: (r) => formatDate(r.upcomingAuditDate) },
          { key: "isActive", header: "Status", render: (r) => <StatusBadge status={r.isActive ? "active" : "inactive"} /> },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No auditors assigned to your company yet — this is managed by Admin"
      />
    </PageTemplate>
  );
}
