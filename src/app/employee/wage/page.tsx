"use client";

import { useEffect, useState, useCallback } from "react";
import { IndianRupee } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, getMonthName } from "@/lib/utils";

interface WageConfig {
  basic: string; da: string; hra: string; ta: string; otherAllowances: string;
  grossWage: string; pfPercentage: string; esiPercentage: string; ptAmount: string;
  overtimeMultiplier: string;
}

interface PayrollLine {
  month: number; year: number;
  basic: string; da: string; hra: string; ta: string;
  overtimeWage: string; incentive: string; bonus: string; grossEarnings: string;
  pfDeduction: string; esiDeduction: string; ptDeduction: string; otherDeductions: string; messDeduction: string;
  totalDeductions: string; netWage: string;
}

export default function EmployeeWagePage() {
  const [config, setConfig] = useState<WageConfig | null>(null);
  const [latest, setLatest] = useState<PayrollLine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchWage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/employee/wage");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load wage details");
      setConfig(json.data.wageConfig);
      setLatest(json.data.latestPayroll);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wage details");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWage(); }, [fetchWage]);

  if (loading) return <LoadingState message="Loading your wage details..." />;
  if (error) return <ErrorState message={error} onRetry={fetchWage} />;

  return (
    <PageTemplate title="My Wage" subtitle="Approved wage structure and latest payroll" icon={IndianRupee}>
      {!config && !latest ? (
        <div className="bg-white rounded-xl border border-gray-200">
          <EmptyState icon={IndianRupee} title="No wage data yet" description="Your Employer hasn't configured a wage structure or run payroll for you yet." />
        </div>
      ) : (
        <>
          {config && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Approved Wage Structure</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  ["Basic", config.basic], ["DA", config.da], ["HRA", config.hra], ["TA", config.ta],
                  ["Other Allowances", config.otherAllowances], ["Gross Wage", config.grossWage],
                  ["PF %", `${config.pfPercentage}%`], ["ESI %", `${config.esiPercentage}%`],
                  ["Professional Tax", config.ptAmount], ["OT Multiplier", `${config.overtimeMultiplier}x`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">
                      {label.includes("%") || label.includes("Multiplier") ? value : formatCurrency(value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {latest && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">
                Latest Payroll — {getMonthName(latest.month)} {latest.year}
              </h3>
              <p className="text-xs text-gray-500 mb-4">Most recently processed payroll run for you</p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                <h4 className="col-span-full text-xs font-semibold text-gray-500 uppercase">Earnings</h4>
                {[
                  ["Basic", latest.basic], ["DA", latest.da], ["HRA", latest.hra], ["TA", latest.ta],
                  ["Overtime Wage", latest.overtimeWage], ["Incentive", latest.incentive], ["Bonus", latest.bonus],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">{formatCurrency(value)}</p>
                  </div>
                ))}
                <div>
                  <p className="text-xs text-gray-500">Gross Earnings</p>
                  <p className="text-sm font-bold text-green-700 mt-0.5">{formatCurrency(latest.grossEarnings)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                <h4 className="col-span-full text-xs font-semibold text-gray-500 uppercase">Deductions</h4>
                {[
                  ["PF", latest.pfDeduction], ["ESI", latest.esiDeduction], ["Professional Tax", latest.ptDeduction],
                  ["Mess", latest.messDeduction], ["Other", latest.otherDeductions],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">{formatCurrency(value)}</p>
                  </div>
                ))}
                <div>
                  <p className="text-xs text-gray-500">Total Deductions</p>
                  <p className="text-sm font-bold text-red-600 mt-0.5">{formatCurrency(latest.totalDeductions)}</p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">Net Wage</p>
                <p className="text-xl font-bold text-blue-700">{formatCurrency(latest.netWage)}</p>
              </div>
            </div>
          )}
        </>
      )}
    </PageTemplate>
  );
}
