"use client";

import { useEffect, useState, useCallback } from "react";
import { Gift } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatCurrency, getMonthName } from "@/lib/utils";

interface MonthlyRow {
  id: number; month: number; year: number;
  incentive: string; bonus: string; overtimeWage: string;
}

interface RuleRow {
  id: number; name: string; type: string | null; value: string | null; frequency: string | null;
}

export default function EmployeeBenefitsPage() {
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/employee/benefits");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load benefits");
      setMonthly(json.data.monthly);
      setRules(json.data.rules);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load benefits");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingState message="Loading your benefits..." />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <PageTemplate title="Benefits" subtitle="Incentives, bonuses and allowances" icon={Gift}>
      {rules.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Active Benefits</h3>
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
          { key: "incentive", header: "Incentive", render: (r) => formatCurrency(r.incentive) },
          { key: "bonus", header: "Bonus", render: (r) => formatCurrency(r.bonus) },
          { key: "overtimeWage", header: "Overtime Wage", render: (r) => formatCurrency(r.overtimeWage) },
        ]}
        data={monthly}
        emptyMessage="No benefit history yet — this fills in once payroll has been run for you"
      />
    </PageTemplate>
  );
}
