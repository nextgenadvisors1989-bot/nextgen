"use client";

import { useEffect, useState, useCallback } from "react";
import { BarChart3 } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatCurrency, formatDate } from "@/lib/utils";

interface CountRow { count: number; [key: string]: unknown; }
interface AttendanceRow { date: string; present: number; }
interface PayrollRow { month: string; totalNet: string | null; totalGross: string | null; }

export default function EmployerReportsPage() {
  const [byDept, setByDept] = useState<CountRow[]>([]);
  const [attendanceTrend, setAttendanceTrend] = useState<AttendanceRow[]>([]);
  const [monthlyPayroll, setMonthlyPayroll] = useState<PayrollRow[]>([]);
  const [leaveByType, setLeaveByType] = useState<CountRow[]>([]);
  const [auditStatus, setAuditStatus] = useState<CountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/employer/reports");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load reports");
      setByDept(json.data.byDept);
      setAttendanceTrend(json.data.attendanceTrend);
      setMonthlyPayroll(json.data.monthlyPayroll);
      setLeaveByType(json.data.leaveByType);
      setAuditStatus(json.data.auditStatus);
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
    <PageTemplate title="Reports" subtitle="Company-level attendance, payroll and compliance reporting" icon={BarChart3}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Employees by Department</h3>
          {byDept.length === 0 ? <p className="text-sm text-gray-400">No data yet</p> : byDept.map((r) => (
            <div key={String(r.department)} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
              <span className="text-gray-600">{String(r.department)}</span>
              <span className="font-medium text-gray-900">{r.count}</span>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Leave Requests by Type</h3>
          {leaveByType.length === 0 ? <p className="text-sm text-gray-400">No data yet</p> : leaveByType.map((r) => (
            <div key={String(r.type)} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
              <span className="capitalize text-gray-600">{String(r.type)}</span>
              <span className="font-medium text-gray-900">{r.count}</span>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Audits by Status</h3>
          {auditStatus.length === 0 ? <p className="text-sm text-gray-400">No data yet</p> : auditStatus.map((r) => (
            <div key={String(r.status)} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
              <span className="capitalize text-gray-600">{String(r.status).replace(/_/g, " ")}</span>
              <span className="font-medium text-gray-900">{r.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Attendance — Last 30 Days</h3>
        <DataTable<AttendanceRow>
          columns={[
            { key: "date", header: "Date", render: (r) => formatDate(r.date) },
            { key: "present", header: "Present Count" },
          ]}
          data={attendanceTrend}
          emptyMessage="No attendance recorded in the last 30 days"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Monthly Payroll Cost</h3>
        <DataTable<PayrollRow>
          columns={[
            { key: "month", header: "Month" },
            { key: "totalGross", header: "Gross Earnings", render: (r) => formatCurrency(r.totalGross) },
            { key: "totalNet", header: "Net Wages", render: (r) => formatCurrency(r.totalNet) },
          ]}
          data={monthlyPayroll}
          emptyMessage="No payroll runs finalized yet"
        />
      </div>
    </PageTemplate>
  );
}
