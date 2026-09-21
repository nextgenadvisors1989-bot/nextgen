"use client";

import { useEffect, useState, useCallback } from "react";
import { MinusCircle } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatCurrency, getMonthName } from "@/lib/utils";

interface MonthlyRow {
  id: number; month: number; year: number;
  pfDeduction: string; esiDeduction: string; ptDeduction: string;
  messDeduction: string; otherDeductions: string; totalDeductions: string;
}

interface RuleRow {
  id: number; name: string; type: string | null; value: string | null; frequency: string | null;
}

export default function EmployeeDeductionsPage() {
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/employee/deductions");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load deductions");
      setMonthly(json.data.monthly);
      setRules(json.data.rules);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deductions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingState message="Loading your deductions..." />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <PageTemplate title="Deductions" subtitle="Month-wise deduction breakdown" icon={MinusCircle}>
      {rules.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Active Recurring Deductions</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {rules.map((r) => (
              <div key={r.id}>
                <p className="text-xs text-gray-500">{r.name} {r.frequency ? `(${r.frequency})` : ""}</p>
                <p className="text-sm font-medium text-gray-900 mt-0.5">{formatCurrency(r.value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <DataTable<MonthlyRow>
        columns={[
          { key: "period", header: "Month", render: (r) => `${getMonthName(r.month)} ${r.year}` },
          { key: "pfDeduction", header: "PF", render: (r) => formatCurrency(r.pfDeduction) },
          { key: "esiDeduction", header: "ESI", render: (r) => formatCurrency(r.esiDeduction) },
          { key: "ptDeduction", header: "Prof. Tax", render: (r) => formatCurrency(r.ptDeduction) },
          { key: "messDeduction", header: "Mess", render: (r) => formatCurrency(r.messDeduction) },
          { key: "otherDeductions", header: "Other", render: (r) => formatCurrency(r.otherDeductions) },
          { key: "totalDeductions", header: "Total", render: (r) => <span className="font-semibold text-red-600">{formatCurrency(r.totalDeductions)}</span> },
        ]}
        data={monthly}
        emptyMessage="No deduction history yet — this fills in once payroll has been run for you"
      />
    </PageTemplate>
  );
}
