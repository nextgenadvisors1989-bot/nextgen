"use client";

import { useEffect, useState, useCallback } from "react";
import { BarChart3 } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatCurrency } from "@/lib/utils";

interface CountRow { count: number; [key: string]: unknown; }
interface CompanyRow { companyName: string; employeeCount: number; auditCount: number; }
interface PayrollRow { month: string; totalNet: string | null; }

export default function AdminReportsPage() {
  const [byEmployeeType, setByEmployeeType] = useState<CountRow[]>([]);
  const [byAuditStatus, setByAuditStatus] = useState<CountRow[]>([]);
  const [byFindingSeverity, setByFindingSeverity] = useState<CountRow[]>([]);
  const [monthlyPayroll, setMonthlyPayroll] = useState<PayrollRow[]>([]);
  const [topCompanies, setTopCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/reports");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load reports");
      setByEmployeeType(json.data.byEmployeeType);
      setByAuditStatus(json.data.byAuditStatus);
      setByFindingSeverity(json.data.byFindingSeverity);
      setMonthlyPayroll(json.data.monthlyPayroll);
      setTopCompanies(json.data.topCompanies);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingState message="Building platform reports..." />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <PageTemplate title="Reports" subtitle="Platform-wide compliance and workforce reporting" icon={BarChart3}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Employees by Type</h3>
          {byEmployeeType.map((r) => (
            <div key={String(r.type)} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
              <span className="capitalize text-gray-600">{String(r.type)}</span>
              <span className="font-medium text-gray-900">{r.count}</span>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Audits by Status</h3>
          {byAuditStatus.map((r) => (
            <div key={String(r.status)} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
              <span className="capitalize text-gray-600">{String(r.status).replace(/_/g, " ")}</span>
              <span className="font-medium text-gray-900">{r.count}</span>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Findings by Severity</h3>
          {byFindingSeverity.map((r) => (
            <div key={String(r.severity)} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
              <span className="capitalize text-gray-600">{String(r.severity) || "unspecified"}</span>
              <span className="font-medium text-gray-900">{r.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Monthly Payroll Disbursed (Net Wages)</h3>
        <DataTable<PayrollRow>
          columns={[
            { key: "month", header: "Month" },
            { key: "totalNet", header: "Total Net Wages", render: (r) => formatCurrency(r.totalNet) },
          ]}
          data={monthlyPayroll}
          emptyMessage="No payroll data yet"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Active Companies Overview</h3>
        <DataTable<CompanyRow>
          columns={[
            { key: "companyName", header: "Company" },
            { key: "employeeCount", header: "Employees" },
            { key: "auditCount", header: "Audits Conducted" },
          ]}
          data={topCompanies}
          emptyMessage="No active companies yet"
        />
      </div>
    </PageTemplate>
  );
}
