"use client";

import { useEffect, useState, useCallback } from "react";
import { FileCheck2, Plus, Lock } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Settlement {
  id: number; employeeId: number; lastWorkingDate: string;
  pendingWage: string; leaveEncashment: string; gratuity: string; bonus: string; deductions: string; netPayable: string;
  status: string; firstName: string; lastName: string | null; employeeNumber: string | null;
}

interface Employee { id: number; firstName: string; lastName: string | null; employeeNumber: string | null; }

export default function EmployerFnfPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Settlement[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: "", lastWorkingDate: "", reasonForLeaving: "", noticePeriodDays: "30", noticePeriodServed: "30" });
  const [saving, setSaving] = useState(false);
  const [finalizingId, setFinalizingId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, eRes] = await Promise.all([fetch("/api/employer/fnf-settlements"), fetch("/api/employer/employees?pageSize=200&status=active")]);
      const sJson = await sRes.json();
      const eJson = await eRes.json();
      if (!sRes.ok || !sJson.success) throw new Error(sJson.error);
      setRows(sJson.data.settlements);
      if (eRes.ok && eJson.success) setEmployees(eJson.data.employees || []);
    } catch (err) {
      toast.error("Failed to load settlements", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function submit() {
    if (!form.employeeId || !form.lastWorkingDate) { toast.warning("Employee and last working date are required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/employer/fnf-settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          employeeId: Number(form.employeeId),
          noticePeriodDays: Number(form.noticePeriodDays),
          noticePeriodServed: Number(form.noticePeriodServed),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Exit initiated — settlement calculated");
      setOpen(false);
      fetchData();
    } catch (err) {
      toast.error("Failed to initiate exit", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function finalize(id: number) {
    if (!confirm("Finalize this settlement? The employee's account will be deactivated.")) return;
    setFinalizingId(id);
    try {
      const res = await fetch(`/api/employer/fnf-settlements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finalize" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Settlement finalized");
      fetchData();
    } catch (err) {
      toast.error("Failed to finalize", err instanceof Error ? err.message : undefined);
    } finally {
      setFinalizingId(null);
    }
  }

  return (
    <PageTemplate title="F&F Settlement" subtitle="Initiate employee exits and settle final dues" icon={FileCheck2}>
      <div className="flex justify-end mb-3">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition">
          <Plus className="w-3.5 h-3.5" /> Initiate Exit
        </button>
      </div>

      <DataTable<Settlement>
        columns={[
          { key: "employee", header: "Employee", render: (r) => `${r.firstName} ${r.lastName || ""} (${r.employeeNumber})` },
          { key: "lastWorkingDate", header: "Last Working Date", render: (r) => formatDate(r.lastWorkingDate) },
          { key: "pendingWage", header: "Pending Wage", render: (r) => formatCurrency(r.pendingWage) },
          { key: "leaveEncashment", header: "Leave Encashment", render: (r) => formatCurrency(r.leaveEncashment) },
          { key: "deductions", header: "Deductions", render: (r) => formatCurrency(r.deductions) },
          { key: "netPayable", header: "Net Payable", render: (r) => <span className="font-semibold text-blue-700">{formatCurrency(r.netPayable)}</span> },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "actions", header: "", render: (r) => r.status === "draft" ? (
            <button onClick={() => finalize(r.id)} disabled={finalizingId === r.id} className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50">
              <Lock className="w-3 h-3" /> Finalize
            </button>
          ) : <span className="text-xs text-gray-400">-</span> },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No exits in progress"
      />

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Initiate Employee Exit"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Calculating..." : "Initiate & Calculate"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Employee</label>
            <select value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
              <option value="">Select employee</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeNumber})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Last Working Date</label>
            <input type="date" value={form.lastWorkingDate} onChange={(e) => setForm((f) => ({ ...f, lastWorkingDate: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reason for Leaving</label>
            <input value={form.reasonForLeaving} onChange={(e) => setForm((f) => ({ ...f, reasonForLeaving: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notice Period (days)</label>
              <input type="number" value={form.noticePeriodDays} onChange={(e) => setForm((f) => ({ ...f, noticePeriodDays: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notice Served (days)</label>
              <input type="number" value={form.noticePeriodServed} onChange={(e) => setForm((f) => ({ ...f, noticePeriodServed: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Pending wage, leave encashment and active deductions are calculated automatically from wage config, leave balances and deduction records.
          </p>
        </div>
      </Modal>
    </PageTemplate>
  );
}
