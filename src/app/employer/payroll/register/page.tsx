"use client";

import { useEffect, useState, useCallback } from "react";
import { Table, Pencil, Lock, Download } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, getMonthName } from "@/lib/utils";

interface PayrollRun {
  id: number; month: number; year: number; status: string;
  totalGross: string | null; totalNet: string | null;
}

interface Line {
  id: number; employeeId: number;
  daysInMonth: number; daysWorked: string; daysLop: string; overtimeHours: string;
  basic: string; da: string; hra: string; ta: string; overtimeWage: string;
  incentive: string; bonus: string; grossEarnings: string;
  pfDeduction: string; esiDeduction: string; ptDeduction: string; messDeduction: string; otherDeductions: string;
  totalDeductions: string; netWage: string; bankPaymentStatus: string;
  firstName: string; lastName: string | null; employeeNumber: string | null; deptName: string | null; desigName: string | null;
}

export default function EmployerPayrollRegisterPage() {
  const toast = useToast();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingLines, setLoadingLines] = useState(false);

  const [editing, setEditing] = useState<Line | null>(null);
  const [editForm, setEditForm] = useState({ incentive: "0", bonus: "0", otherDeductions: "0", messDeduction: "0" });
  const [saving, setSaving] = useState(false);

  const currentRun = runs.find((r) => r.id === selectedRun);
  const locked = currentRun?.status === "locked" || currentRun?.status === "paid";

  const fetchRuns = useCallback(async () => {
    setLoadingRuns(true);
    try {
      const res = await fetch("/api/employer/payroll-runs?pageSize=50");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRuns(json.data.payrollRuns);
      if (json.data.payrollRuns.length > 0 && !selectedRun) setSelectedRun(json.data.payrollRuns[0].id);
    } catch (err) {
      toast.error("Failed to load payroll runs", err instanceof Error ? err.message : undefined);
    } finally {
      setLoadingRuns(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchLines = useCallback(async () => {
    if (!selectedRun) return;
    setLoadingLines(true);
    try {
      const res = await fetch(`/api/employer/payroll-runs/${selectedRun}/lines`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setLines(json.data.lines);
    } catch (err) {
      toast.error("Failed to load register", err instanceof Error ? err.message : undefined);
    } finally {
      setLoadingLines(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRun]);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);
  useEffect(() => { fetchLines(); }, [fetchLines]);

  function openEdit(line: Line) {
    setEditing(line);
    setEditForm({ incentive: line.incentive, bonus: line.bonus, otherDeductions: line.otherDeductions, messDeduction: line.messDeduction });
  }

  async function saveEdit() {
    if (!editing || !selectedRun) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/employer/payroll-runs/${selectedRun}/lines/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Line updated");
      setEditing(null);
      fetchLines();
    } catch (err) {
      toast.error("Failed to update", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  if (loadingRuns) return <LoadingState message="Loading payroll runs..." />;

  return (
    <PageTemplate title="Payroll Register" subtitle="Full wage component register for a payroll run" icon={Table}>
      {runs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200">
          <EmptyState icon={Table} title="No payroll runs yet" description="Create and calculate a payroll run from the Payroll Processing page first." />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <select value={selectedRun ?? ""} onChange={(e) => setSelectedRun(Number(e.target.value))} className="text-sm border border-gray-300 rounded-lg px-3 py-2">
              {runs.map((r) => <option key={r.id} value={r.id}>{getMonthName(r.month)} {r.year} — {r.status}</option>)}
            </select>
            {currentRun && (
              <div className="flex items-center gap-3">
                <StatusBadge status={currentRun.status} />
                {locked && <span className="text-xs text-gray-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Locked — read only</span>}
              </div>
            )}
          </div>

          <DataTable<Line>
            columns={[
              { key: "employee", header: "Employee", render: (r) => `${r.firstName} ${r.lastName || ""} (${r.employeeNumber || "-"})` },
              { key: "dept", header: "Dept / Desig", render: (r) => `${r.deptName || "-"} / ${r.desigName || "-"}` },
              { key: "daysWorked", header: "Days", render: (r) => `${r.daysWorked}/${r.daysInMonth}` },
              { key: "otHours", header: "OT Hrs", render: (r) => r.overtimeHours },
              { key: "grossEarnings", header: "Gross", render: (r) => formatCurrency(r.grossEarnings) },
              { key: "totalDeductions", header: "Deductions", render: (r) => formatCurrency(r.totalDeductions) },
              { key: "netWage", header: "Net Wage", render: (r) => <span className="font-semibold text-green-700">{formatCurrency(r.netWage)}</span> },
              { key: "bankPaymentStatus", header: "Payment", render: (r) => <StatusBadge status={r.bankPaymentStatus} /> },
              { key: "actions", header: "", render: (r) => !locked ? (
                <button onClick={() => openEdit(r)} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              ) : (
                <span className="flex items-center gap-1 text-xs text-gray-400"><Download className="w-3 h-3" /> Slip generated</span>
              ) },
            ]}
            data={lines}
            loading={loadingLines}
            emptyMessage="This run hasn't been calculated yet — go to Payroll Processing and click Calculate."
          />
        </>
      )}

      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Edit — ${editing.firstName} ${editing.lastName || ""}` : ""}
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={saveEdit} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Saving..." : "Save & Recalculate"}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          {[["incentive", "Incentive"], ["bonus", "Bonus"], ["messDeduction", "Mess Deduction"], ["otherDeductions", "Other Deduction"]].map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <input
                type="number" step="0.01"
                value={(editForm as Record<string, string>)[key]}
                onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">Gross, total deductions and net wage recalculate automatically on save.</p>
      </Modal>
    </PageTemplate>
  );
}
