"use client";

import { useEffect, useState, useCallback } from "react";
import { Building2 } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface Company {
  assignmentId: number;
  employerId: number;
  companyName: string;
  email: string;
  state: string | null;
  industry: string | null;
  startDate: string | null;
  endDate: string | null;
}

export default function AuditorCompaniesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auditor/assigned-companies");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.companies);
    } catch (err) {
      toast.error("Failed to load companies", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return (
    <PageTemplate title="Assigned Companies" subtitle="Companies you're authorized to audit" icon={Building2}>
      <DataTable<Company>
        columns={[
          { key: "companyName", header: "Company" },
          { key: "industry", header: "Industry", render: (r) => r.industry || "-" },
          { key: "state", header: "State", render: (r) => r.state || "-" },
          { key: "validity", header: "Assignment Validity", render: (r) => `${formatDate(r.startDate)} — ${formatDate(r.endDate)}` },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="You haven't been assigned to any companies yet — this is managed by Admin"
      />
    </PageTemplate>
  );
}
