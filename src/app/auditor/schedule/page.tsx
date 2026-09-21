"use client";

import { useEffect, useState, useCallback } from "react";
import { CalendarDays, ArrowRight } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

interface Audit {
  id: number; auditNumber: string | null; status: string; auditDate: string | null;
  auditTypeName: string | null; companyName: string | null;
}

export default function AuditorSchedulePage() {
  const toast = useToast();
  const [rows, setRows] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auditor/audits?status=draft&pageSize=100");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.audits);
    } catch (err) {
      toast.error("Failed to load schedule", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return (
    <PageTemplate title="Audit Schedule" subtitle="Draft and upcoming audits" icon={CalendarDays}>
      <DataTable<Audit>
        columns={[
          { key: "companyName", header: "Company", render: (r) => r.companyName || "-" },
          { key: "auditTypeName", header: "Audit Type", render: (r) => r.auditTypeName || "-" },
          { key: "auditDate", header: "Scheduled Date", render: (r) => formatDate(r.auditDate) },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "actions", header: "", render: (r) => (
            <Link href={`/auditor/audits/${r.id}`} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
              Start Audit <ArrowRight className="w-3 h-3" />
            </Link>
          ) },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="Nothing scheduled — start a new audit from Checklist & Forms"
      />
    </PageTemplate>
  );
}
