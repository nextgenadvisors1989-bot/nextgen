"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

interface Finding {
  id: number; findingNumber: string | null; description: string; severity: string | null; status: string | null;
  targetDate: string | null; responsiblePerson: string | null; auditId: number; auditNumber: string | null; companyName: string;
}

export default function AuditorFindingsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auditor/findings");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.findings);
    } catch (err) {
      toast.error("Failed to load findings", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return (
    <PageTemplate title="Findings" subtitle="Findings raised across all your audits" icon={AlertTriangle}>
      <DataTable<Finding>
        columns={[
          { key: "findingNumber", header: "Finding #", render: (r) => r.findingNumber || `#${r.id}` },
          { key: "companyName", header: "Company" },
          { key: "description", header: "Description" },
          { key: "severity", header: "Severity", render: (r) => r.severity ? <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full capitalize">{r.severity}</span> : "-" },
          { key: "responsiblePerson", header: "Responsible", render: (r) => r.responsiblePerson || "-" },
          { key: "targetDate", header: "Target Date", render: (r) => formatDate(r.targetDate) },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status || "open"} /> },
          { key: "actions", header: "", render: (r) => (
            <Link href={`/auditor/audits/${r.auditId}`} className="text-xs text-blue-600 hover:underline">View Audit</Link>
          ) },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No findings raised yet"
      />
    </PageTemplate>
  );
}
