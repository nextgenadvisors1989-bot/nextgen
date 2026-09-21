"use client";

import { useEffect, useState, useCallback } from "react";
import { Camera } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

interface Evidence {
  id: number; findingNumber: string | null; evidenceUrl: string; createdAt: string;
  companyName: string; auditNumber: string | null; auditId: number;
}

export default function AuditorEvidencePage() {
  const toast = useToast();
  const [rows, setRows] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auditor/evidence");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.evidence);
    } catch (err) {
      toast.error("Failed to load evidence", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return (
    <PageTemplate title="Evidence Upload" subtitle="Evidence attached to findings across your audits" icon={Camera}>
      <DataTable<Evidence>
        columns={[
          { key: "companyName", header: "Company" },
          { key: "auditNumber", header: "Audit #", render: (r) => r.auditNumber || `#${r.auditId}` },
          { key: "findingNumber", header: "Finding", render: (r) => r.findingNumber || "-" },
          { key: "evidenceUrl", header: "Evidence", render: (r) => <a href={r.evidenceUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">Open</a> },
          { key: "createdAt", header: "Added", render: (r) => formatDate(r.createdAt) },
          { key: "actions", header: "", render: (r) => <Link href={`/auditor/audits/${r.auditId}`} className="text-xs text-gray-500 hover:underline">View Audit</Link> },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No evidence uploaded yet — attach evidence URLs when raising a finding on an audit"
      />
    </PageTemplate>
  );
}
