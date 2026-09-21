"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, CreditCard } from "lucide-react";
import Link from "next/link";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatCurrency, formatDate, getMonthName } from "@/lib/utils";
import { useParams } from "next/navigation";

interface PayrollLine {
  id: number;
  employeeNumber: string | null;
  firstName: string;
  lastName: string | null;
  deptName: string | null;
  desigName: string | null;
  daysWorked: string | null;
  grossEarnings: string | null;
  totalDeductions: string | null;
  netWage: string | null;
  bankPaymentStatus: string | null;
}

interface PayrollRun {
  id: number;
  month: number;
  year: number;
  status: string;
  totalGross: string | null;
  totalDeductions: string | null;
  totalNet: string | null;
  processedAt: string | null;
  createdAt: string;
}

export default function PayrollDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [lines, setLines] = useState<PayrollLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadPayroll() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/employer/payroll-runs/${id}/lines`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to load payroll register");
      setRun(data.data.run);
      setLines(data.data.lines || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load payroll register");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) loadPayroll();
  }, [id]);

  if (loading) return <LoadingState message="Loading payroll register..." />;
  if (error || !run) return <ErrorState message={error || "Payroll run not found"} onRetry={loadPayroll} />;

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/employer/payroll" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Back to payroll">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="w-10 h-10 rounded-lg bg-green-600 flex items-center justify-center">
          <CreditCard className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Payroll Register</h1>
          <p className="text-xs text-gray-500">{getMonthName(run.month)} {run.year}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4"><p className="text-xs text-gray-500">Status</p><div className="mt-1"><StatusBadge status={run.status} /></div></div>
        <div className="bg-white border border-gray-200 rounded-lg p-4"><p className="text-xs text-gray-500">Employees</p><p className="text-lg font-semibold mt-1">{lines.length}</p></div>
        <div className="bg-white border border-gray-200 rounded-lg p-4"><p className="text-xs text-gray-500">Gross</p><p className="text-lg font-semibold mt-1">{formatCurrency(run.totalGross)}</p></div>
        <div className="bg-white border border-gray-200 rounded-lg p-4"><p className="text-xs text-gray-500">Deductions</p><p className="text-lg font-semibold mt-1">{formatCurrency(run.totalDeductions)}</p></div>
        <div className="bg-white border border-gray-200 rounded-lg p-4"><p className="text-xs text-gray-500">Net payable</p><p className="text-lg font-semibold text-green-700 mt-1">{formatCurrency(run.totalNet)}</p></div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-left text-xs text-gray-500 uppercase">
              <th className="px-4 py-3">Employee</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Days worked</th><th className="px-4 py-3">Gross</th><th className="px-4 py-3">Deductions</th><th className="px-4 py-3">Net wage</th><th className="px-4 py-3">Payment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map((line) => (
              <tr key={line.id}>
                <td className="px-4 py-3"><p className="font-medium text-gray-900">{line.firstName} {line.lastName || ""}</p><p className="text-xs text-gray-500">{line.employeeNumber || "-"}</p></td>
                <td className="px-4 py-3"><p>{line.deptName || "-"}</p><p className="text-xs text-gray-500">{line.desigName || "-"}</p></td>
                <td className="px-4 py-3">{line.daysWorked || "-"}</td>
                <td className="px-4 py-3">{formatCurrency(line.grossEarnings)}</td>
                <td className="px-4 py-3">{formatCurrency(line.totalDeductions)}</td>
                <td className="px-4 py-3 font-semibold text-green-700">{formatCurrency(line.netWage)}</td>
                <td className="px-4 py-3 capitalize">{line.bankPaymentStatus || "-"}</td>
              </tr>
            ))}
            {lines.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">No payroll lines are available for this run.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3">Created {formatDate(run.createdAt)}{run.processedAt ? ` · Processed ${formatDate(run.processedAt)}` : ""}</p>
    </div>
  );
}
