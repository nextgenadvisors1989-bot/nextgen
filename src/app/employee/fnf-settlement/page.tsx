"use client";

import { useEffect, useState, useCallback } from "react";
import { FileCheck2 } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Settlement {
  lastWorkingDate: string | null;
  reasonForLeaving: string | null;
  noticePeriodDays: number | null;
  noticePeriodServed: number | null;
  noticePeriodShortfall: number | null;
  pendingWage: string | null;
  leaveEncashment: string | null;
  gratuity: string | null;
  bonus: string | null;
  deductions: string | null;
  netPayable: string | null;
  status: string;
}

export default function EmployeeFnfPage() {
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/employee/fnf-settlement");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load settlement");
      setSettlement(json.data.settlement);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settlement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingState message="Loading..." />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <PageTemplate title="F&F Settlement" subtitle="Full & final settlement details" icon={FileCheck2}>
      {!settlement ? (
        <div className="bg-white rounded-xl border border-gray-200">
          <EmptyState icon={FileCheck2} title="No exit in progress" description="This page will populate once your Employer initiates your exit process." />
        </div>
      ) : (
        <div className="max-w-2xl mx-auto bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-gray-900">Settlement Summary</h2>
            <StatusBadge status={settlement.status} />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <p className="text-xs text-gray-500">Last Working Date</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">{formatDate(settlement.lastWorkingDate)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Reason for Leaving</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">{settlement.reasonForLeaving || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Notice Period</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">
                {settlement.noticePeriodServed ?? 0} / {settlement.noticePeriodDays ?? 0} days served
                {Number(settlement.noticePeriodShortfall) > 0 && (
                  <span className="text-orange-600"> ({settlement.noticePeriodShortfall} day shortfall)</span>
                )}
              </p>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4 space-y-3">
            {[
              ["Pending Salary", settlement.pendingWage],
              ["Leave Encashment", settlement.leaveEncashment],
              ["Gratuity", settlement.gratuity],
              ["Bonus", settlement.bonus],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-gray-600">{label}</span>
                <span className="font-medium text-gray-900">{formatCurrency(value)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Deductions</span>
              <span className="font-medium text-red-600">- {formatCurrency(settlement.deductions)}</span>
            </div>
          </div>

          <div className="border-t border-gray-200 mt-4 pt-4 flex justify-between items-center">
            <span className="text-sm font-semibold text-gray-900">Net Payable</span>
            <span className="text-xl font-bold text-blue-700">{formatCurrency(settlement.netPayable)}</span>
          </div>
        </div>
      )}
    </PageTemplate>
  );
}
