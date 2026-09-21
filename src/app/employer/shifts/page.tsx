"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock, Plus } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

interface Shift {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number | null;
  workingHours: string | null;
  isActive: boolean;
}

export default function EmployerShiftsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", startTime: "09:00", endTime: "18:00", breakMinutes: "30", workingHours: "8" });
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/employer/shifts");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.shifts);
    } catch (err) {
      toast.error("Failed to load shifts", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function submit() {
    if (!form.name || !form.startTime || !form.endTime) { toast.warning("Name, start and end time are required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/employer/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Shift created");
      setOpen(false);
      fetchRows();
    } catch (err) {
      toast.error("Failed to create shift", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(shift: Shift) {
    setTogglingId(shift.id);
    try {
      const res = await fetch(`/api/employer/shifts/${shift.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !shift.isActive }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      fetchRows();
    } catch (err) {
      toast.error("Failed to update", err instanceof Error ? err.message : undefined);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <PageTemplate title="Shifts" subtitle="Configure your company's shift patterns" icon={Clock}>
      <div className="flex justify-end mb-3">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition">
          <Plus className="w-3.5 h-3.5" /> Add Shift
        </button>
      </div>

      <DataTable<Shift>
        columns={[
          { key: "name", header: "Shift" },
          { key: "startTime", header: "Start" },
          { key: "endTime", header: "End" },
          { key: "breakMinutes", header: "Break (min)", render: (r) => r.breakMinutes ?? "-" },
          { key: "workingHours", header: "Working Hours", render: (r) => r.workingHours ?? "-" },
          { key: "isActive", header: "Status", render: (r) => (
            <button
              onClick={() => toggleActive(r)}
              disabled={togglingId === r.id}
              className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${r.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}
            >
              {r.isActive ? "Active" : "Inactive"}
            </button>
          ) },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No shifts configured yet"
      />

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Add Shift"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Saving..." : "Create Shift"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Shift Name</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. General Shift" className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Time</label>
              <input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">End Time</label>
              <input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Break (minutes)</label>
              <input type="number" value={form.breakMinutes} onChange={(e) => setForm((f) => ({ ...f, breakMinutes: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Working Hours</label>
              <input type="number" step="0.5" value={form.workingHours} onChange={(e) => setForm((f) => ({ ...f, workingHours: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
          </div>
        </div>
      </Modal>
    </PageTemplate>
  );
}
