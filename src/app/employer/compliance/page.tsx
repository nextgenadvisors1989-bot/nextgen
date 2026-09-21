"use client";

import { useEffect, useState, useCallback } from "react";
import { ShieldCheck } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface ComplianceRow {
  id: number; auditNumber: string | null; auditDate: string | null; status: string;
  auditTypeName: string; auditorFirstName: string; auditorLastName: string | null;
  totalFindings: number; criticalFindings: number; openFindings: number;
}

export default function EmployerCompliancePage() {
  const toast = useToast();
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/employer/compliance");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.audits);
    } catch (err) {
      toast.error("Failed to load compliance register", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return (
    <PageTemplate title="Compliance Register" subtitle="Audit status and finding closure across your company" icon={ShieldCheck}>
      <DataTable<ComplianceRow>
        columns={[
          { key: "auditNumber", header: "Audit #", render: (r) => r.auditNumber || `#${r.id}` },
          { key: "auditTypeName", header: "Audit Type" },
          { key: "auditor", header: "Auditor", render: (r) => `${r.auditorFirstName} ${r.auditorLastName || ""}` },
          { key: "auditDate", header: "Date", render: (r) => formatDate(r.auditDate) },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "totalFindings", header: "Findings" },
          { key: "criticalFindings", header: "Critical", render: (r) => r.criticalFindings > 0 ? <span className="text-red-600 font-semibold">{r.criticalFindings}</span> : "0" },
          { key: "openFindings", header: "Open", render: (r) => r.openFindings > 0 ? <span className="text-orange-600 font-semibold">{r.openFindings}</span> : "0" },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No audits recorded for your company yet"
      />
    </PageTemplate>
  );
}
