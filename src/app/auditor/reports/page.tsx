"use client";

import { useEffect, useState, useCallback } from "react";
import { BarChart3 } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

interface CompanyRow { companyName: string; totalAudits: number; submittedAudits: number; }
interface MonthRow { month: string; count: number; }
interface FindingSummary { total: number; open: number; closed: number; critical: number; }
interface CASummary { total: number; overdue: number; }

export default function AuditorReportsPage() {
  const [byCompany, setByCompany] = useState<CompanyRow[]>([]);
  const [byMonth, setByMonth] = useState<MonthRow[]>([]);
  const [findingSummary, setFindingSummary] = useState<FindingSummary | null>(null);
  const [caSummary, setCaSummary] = useState<CASummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auditor/reports");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load reports");
      setByCompany(json.data.byCompany);
      setByMonth(json.data.byMonth);
      setFindingSummary(json.data.findingSummary);
      setCaSummary(json.data.caSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingState message="Building your reports..." />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <PageTemplate title="Reports" subtitle="Your audit activity summary" icon={BarChart3}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          ["Total Findings", findingSummary?.total ?? 0],
          ["Open Findings", findingSummary?.open ?? 0],
          ["Critical Findings", findingSummary?.critical ?? 0],
          ["Overdue Corrective Actions", caSummary?.overdue ?? 0],
        ].map(([label, value]) => (
          <div key={label as string} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value as number}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Company-wise Audit History</h3>
        <DataTable<CompanyRow>
          columns={[
            { key: "companyName", header: "Company" },
            { key: "totalAudits", header: "Total Audits" },
            { key: "submittedAudits", header: "Submitted / Approved" },
          ]}
          data={byCompany}
          emptyMessage="No audits recorded yet"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Monthly Audit Volume</h3>
        <DataTable<MonthRow>
          columns={[
            { key: "month", header: "Month" },
            { key: "count", header: "Audits" },
          ]}
          data={byMonth}
          emptyMessage="No audits recorded yet"
        />
      </div>
    </PageTemplate>
  );
}
