"use client";

import { useEffect, useState, useCallback } from "react";
import { Settings2, Plus } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatDate } from "@/lib/utils";

interface WageConfig {
  id: number;
  employeeId: number | null;
  name: string | null;
  basic: string;
  da: string;
  hra: string;
  ta: string;
  grossWage: string;
  pfPercentage: string;
  esiPercentage: string;
  ptAmount: string;
  isActive: boolean;
  effectiveFrom: string | null;
  employeeFirstName: string | null;
  employeeLastName: string | null;
  employeeNumber: string | null;
}

interface Employee { id: number; firstName: string; lastName: string | null; employeeNumber: string | null; }

const emptyForm = { employeeId: "", name: "", basic: "", da: "0", hra: "0", ta: "0", otherAllowances: "0", pfPercentage: "12", esiPercentage: "0.75", ptAmount: "0", overtimeMultiplier: "1.5", effectiveFrom: new Date().toISOString().slice(0, 10) };

export default function EmployerWageConfigPage() {
  const toast = useToast();
  const [rows, setRows] = useState<WageConfig[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [wcRes, empRes] = await Promise.all([
        fetch("/api/employer/wage-configs"),
        fetch("/api/employer/employees?pageSize=200"),
      ]);
      const wcJson = await wcRes.json();
      const empJson = await empRes.json();
      if (!wcRes.ok || !wcJson.success) throw new Error(wcJson.error);
      setRows(wcJson.data.wageConfigs);
      if (empRes.ok && empJson.success) setEmployees(empJson.data.employees || []);
    } catch (err) {
      toast.error("Failed to load wage configurations", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function submit() {
    if (!form.employeeId || !form.basic) { toast.warning("Employee and basic wage are required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/employer/wage-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, employeeId: Number(form.employeeId) }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Wage configuration saved");
      setOpen(false);
      setForm(emptyForm);
      fetchData();
    } catch (err) {
      toast.error("Failed to save", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageTemplate title="Wage Configuration" subtitle="Basic, DA, HRA, TA, PF/ESI rules per employee" icon={Settings2}>
      <div className="flex justify-end mb-3">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition">
          <Plus className="w-3.5 h-3.5" /> New Wage Structure
        </button>
      </div>

      <DataTable<WageConfig>
        columns={[
          { key: "employee", header: "Employee", render: (r) => r.employeeId ? `${r.employeeFirstName} ${r.employeeLastName || ""} (${r.employeeNumber})` : (r.name || "Default") },
          { key: "basic", header: "Basic", render: (r) => formatCurrency(r.basic) },
          { key: "da", header: "DA", render: (r) => formatCurrency(r.da) },
          { key: "hra", header: "HRA", render: (r) => formatCurrency(r.hra) },
          { key: "ta", header: "TA", render: (r) => formatCurrency(r.ta) },
          { key: "grossWage", header: "Gross", render: (r) => <span className="font-semibold">{formatCurrency(r.grossWage)}</span> },
          { key: "pfPercentage", header: "PF %", render: (r) => `${r.pfPercentage}%` },
          { key: "esiPercentage", header: "ESI %", render: (r) => `${r.esiPercentage}%` },
          { key: "effectiveFrom", header: "Effective From", render: (r) => formatDate(r.effectiveFrom) },
          { key: "isActive", header: "Status", render: (r) => <StatusBadge status={r.isActive ? "active" : "inactive"} /> },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No wage structures configured yet"
      />

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="New Wage Structure"
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Employee</label>
            <select value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
              <option value="">Select employee</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeNumber})</option>)}
            </select>
          </div>
          {[
            ["basic", "Basic"], ["da", "DA"], ["hra", "HRA"], ["ta", "TA"], ["otherAllowances", "Other Allowances"],
            ["pfPercentage", "PF %"], ["esiPercentage", "ESI %"], ["ptAmount", "Professional Tax"], ["overtimeMultiplier", "OT Multiplier"],
          ].map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <input
                type="number" step="0.01"
                value={(form as Record<string, string>)[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Effective From</label>
            <input type="date" value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
        </div>
      </Modal>
    </PageTemplate>
  );
}
