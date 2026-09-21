"use client";

import { useEffect, useState, useCallback } from "react";
import { CreditCard, Plus, Calculator, Lock, ChevronRight } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatDate, getMonthName } from "@/lib/utils";
import Link from "next/link";

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

export default function EmployerPayrollPage() {
  const { success, error: showError } = useToast();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [form, setForm] = useState({ month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()) });
  const [submitting, setSubmitting] = useState(false);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/employer/payroll-runs?page=${page}&pageSize=${pageSize}`);
      const data = await res.json();
      if (data.success) { setRuns(data.data.payrollRuns); setTotal(data.data.total); }
    } catch { showError("Failed to load payroll runs"); }
    finally { setLoading(false); }
  }, [page, pageSize]);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/employer/payroll-runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { showError(data.error || "Failed to create payroll"); return; }
      success("Payroll run created");
      setShowCreate(false);
      fetchRuns();
    } catch { showError("Failed to create payroll run"); }
    finally { setSubmitting(false); }
  }

  async function handleCalculate(id: number) {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/employer/payroll-runs/${id}/calculate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { showError(data.error || "Failed to calculate"); return; }
      success(`Payroll calculated - Net: ${formatCurrency(data.data.totalNet)}`);
      fetchRuns();
    } catch { showError("Failed to calculate payroll"); }
    finally { setProcessingId(null); }
  }

  async function handleFinalize(id: number) {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/employer/payroll-runs/${id}/finalize`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { showError(data.error || "Failed to finalize"); return; }
      success("Payroll finalized and salary slips generated");
      fetchRuns();
    } catch { showError("Failed to finalize payroll"); }
    finally { setProcessingId(null); }
  }

  const columns = [
    { key: "period", header: "Period", render: (r: PayrollRun) => <span className="font-medium text-gray-900">{getMonthName(r.month)} {r.year}</span> },
    { key: "totalGross", header: "Gross", render: (r: PayrollRun) => <span className="text-sm">{formatCurrency(r.totalGross)}</span> },
    { key: "totalDeductions", header: "Deductions", render: (r: PayrollRun) => <span className="text-sm">{formatCurrency(r.totalDeductions)}</span> },
    { key: "totalNet", header: "Net Payable", render: (r: PayrollRun) => <span className="font-semibold text-green-700">{formatCurrency(r.totalNet)}</span> },
    { key: "status", header: "Status", render: (r: PayrollRun) => <StatusBadge status={r.status} /> },
    { key: "processedAt", header: "Processed", render: (r: PayrollRun) => <span className="text-xs text-gray-500">{formatDate(r.processedAt)}</span> },
    { key: "actions", header: "Actions", render: (r: PayrollRun) => (
      <div className="flex items-center gap-2">
        {(r.status === "draft") && (
          <button onClick={() => handleCalculate(r.id)} disabled={processingId === r.id} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
            {processingId === r.id ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Calculator className="w-3 h-3" />}
            Calculate
          </button>
        )}
        {r.status === "calculated" && (
          <button onClick={() => handleFinalize(r.id)} disabled={processingId === r.id} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50">
            {processingId === r.id ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Lock className="w-3 h-3" />}
            Finalize
          </button>
        )}
        <Link href={`/employer/payroll/${r.id}`} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition">
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    )},
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-green-600 flex items-center justify-center"><CreditCard className="w-5 h-5 text-white" /></div>
          <div><h1 className="text-lg font-bold text-gray-900">Payroll Processing</h1><p className="text-xs text-gray-500">{total} payroll runs</p></div>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">
          <Plus className="w-4 h-4" />New Payroll Run
        </button>
      </div>

      <DataTable columns={columns as never} data={runs as unknown as Record<string, unknown>[]} total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} loading={loading} emptyMessage="No payroll runs found. Create your first payroll run." keyField="id" />

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Payroll Run" size="sm">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Month *</label>
            <select required value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{getMonthName(m)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Year *</label>
            <input required type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2">
              {submitting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Create Payroll Run
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
