"use client";

import { useEffect, useState, useCallback } from "react";
import { MinusCircle, Plus } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Deduction {
  id: number; employeeId: number | null; name: string; type: string | null; value: string | null;
  frequency: string | null; isActive: boolean; createdAt: string;
  firstName: string | null; lastName: string | null; employeeNumber: string | null;
}

interface Employee { id: number; firstName: string; lastName: string | null; employeeNumber: string | null; }

const TYPES = ["pf", "esi", "professional_tax", "insurance", "mess", "loan_recovery", "advance_recovery", "damage_recovery", "other"];

export default function EmployerDeductionsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Deduction[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: "", name: "", type: "other", value: "", frequency: "one_time" });
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, eRes] = await Promise.all([fetch("/api/employer/deductions"), fetch("/api/employer/employees?pageSize=200")]);
      const dJson = await dRes.json();
      const eJson = await eRes.json();
      if (!dRes.ok || !dJson.success) throw new Error(dJson.error);
      setRows(dJson.data.deductions);
      if (eRes.ok && eJson.success) setEmployees(eJson.data.employees || []);
    } catch (err) {
      toast.error("Failed to load deductions", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function submit() {
    if (!form.employeeId || !form.name || !form.value) { toast.warning("Employee, name and value are required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/employer/deductions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, employeeId: Number(form.employeeId) }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Deduction added");
      setOpen(false);
      setForm({ employeeId: "", name: "", type: "other", value: "", frequency: "one_time" });
      fetchData();
    } catch (err) {
      toast.error("Failed to add deduction", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(d: Deduction) {
    setTogglingId(d.id);
    try {
      const res = await fetch(`/api/employer/deductions/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !d.isActive }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      fetchData();
    } catch (err) {
      toast.error("Failed to update", err instanceof Error ? err.message : undefined);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <PageTemplate title="Deductions" subtitle="PF, ESI, recoveries and other employee deductions" icon={MinusCircle}>
      <div className="flex justify-end mb-3">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition">
          <Plus className="w-3.5 h-3.5" /> Add Deduction
        </button>
      </div>

      <DataTable<Deduction>
        columns={[
          { key: "employee", header: "Employee", render: (r) => `${r.firstName} ${r.lastName || ""} (${r.employeeNumber})` },
          { key: "name", header: "Deduction" },
          { key: "type", header: "Type", render: (r) => (r.type || "-").replace(/_/g, " ") },
          { key: "value", header: "Value", render: (r) => formatCurrency(r.value) },
          { key: "frequency", header: "Frequency", render: (r) => (r.frequency || "-").replace(/_/g, " ") },
          { key: "createdAt", header: "Added", render: (r) => formatDate(r.createdAt) },
          { key: "isActive", header: "Status", render: (r) => (
            <button onClick={() => toggle(r)} disabled={togglingId === r.id} className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${r.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
              {r.isActive ? "Active" : "Inactive"}
            </button>
          ) },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No deductions configured yet"
      />

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Add Deduction"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Saving..." : "Add"}
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Deduction Name</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" placeholder="e.g. Loan EMI" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
                {TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
              <select value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
                <option value="one_time">One Time</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Value (₹)</label>
            <input type="number" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
        </div>
      </Modal>
    </PageTemplate>
  );
}
