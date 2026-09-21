"use client";

import { useEffect, useState, useCallback } from "react";
import { Gift, Plus } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Benefit {
  id: number; employeeId: number | null; name: string; type: string | null; value: string | null;
  frequency: string | null; isActive: boolean; createdAt: string;
  firstName: string | null; lastName: string | null; employeeNumber: string | null;
}

interface Employee { id: number; firstName: string; lastName: string | null; employeeNumber: string | null; }

const TYPES = ["incentive", "bonus", "promotion", "increment", "attendance_bonus", "festival_bonus", "performance_incentive", "travel_allowance", "special_allowance", "other"];

export default function EmployerBenefitsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Benefit[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: "", name: "", type: "incentive", value: "", frequency: "one_time" });
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, eRes] = await Promise.all([fetch("/api/employer/benefits"), fetch("/api/employer/employees?pageSize=200")]);
      const bJson = await bRes.json();
      const eJson = await eRes.json();
      if (!bRes.ok || !bJson.success) throw new Error(bJson.error);
      setRows(bJson.data.benefits);
      if (eRes.ok && eJson.success) setEmployees(eJson.data.employees || []);
    } catch (err) {
      toast.error("Failed to load benefits", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function submit() {
    if (!form.name || !form.value) { toast.warning("Name and value are required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/employer/benefits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, employeeId: form.employeeId ? Number(form.employeeId) : null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Benefit added");
      setOpen(false);
      setForm({ employeeId: "", name: "", type: "incentive", value: "", frequency: "one_time" });
      fetchData();
    } catch (err) {
      toast.error("Failed to add benefit", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(b: Benefit) {
    setTogglingId(b.id);
    try {
      const res = await fetch(`/api/employer/benefits/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !b.isActive }),
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
    <PageTemplate title="Benefits" subtitle="Incentives, bonuses and allowances" icon={Gift}>
      <div className="flex justify-end mb-3">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition">
          <Plus className="w-3.5 h-3.5" /> Add Benefit
        </button>
      </div>

      <DataTable<Benefit>
        columns={[
          { key: "employee", header: "Employee", render: (r) => r.employeeId ? `${r.firstName} ${r.lastName || ""} (${r.employeeNumber})` : "All Employees" },
          { key: "name", header: "Benefit" },
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
        emptyMessage="No benefits configured yet"
      />

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Add Benefit"
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Employee (leave blank to apply to all)</label>
            <select value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
              <option value="">All Employees</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeNumber})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Benefit Name</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" placeholder="e.g. Diwali Bonus" />
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
                <option value="annual">Annual</option>
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
