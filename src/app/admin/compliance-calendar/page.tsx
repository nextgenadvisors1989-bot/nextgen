"use client";

import { useEffect, useState, useCallback } from "react";
import { CalendarClock, Plus, Check } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface CalendarItem {
  id: number; employerId: number | null; title: string; description: string | null; dueDate: string;
  frequency: string | null; status: string | null; assignedTo: string | null; reminderDays: number | null; companyName: string | null;
}

interface Employer { id: number; companyName: string; }

export default function AdminComplianceCalendarPage() {
  const toast = useToast();
  const [rows, setRows] = useState<CalendarItem[]>([]);
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employerId: "", title: "", description: "", dueDate: "", frequency: "one_time", assignedTo: "", reminderDays: "7" });
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, eRes] = await Promise.all([fetch("/api/admin/compliance-calendar"), fetch("/api/admin/employers?pageSize=200&status=active")]);
      const cJson = await cRes.json();
      const eJson = await eRes.json();
      if (!cRes.ok || !cJson.success) throw new Error(cJson.error);
      setRows(cJson.data.items);
      if (eRes.ok && eJson.success) setEmployers(eJson.data.employers || []);
    } catch (err) {
      toast.error("Failed to load calendar", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function submit() {
    if (!form.title || !form.dueDate) { toast.warning("Title and due date are required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/compliance-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, employerId: form.employerId ? Number(form.employerId) : null, reminderDays: Number(form.reminderDays) }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Calendar entry added");
      setOpen(false);
      fetchData();
    } catch (err) {
      toast.error("Failed to add entry", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function complete(id: number) {
    setActingId(id);
    try {
      const res = await fetch(`/api/admin/compliance-calendar/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "completed" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Marked complete");
      fetchData();
    } catch (err) {
      toast.error("Failed to update", err instanceof Error ? err.message : undefined);
    } finally {
      setActingId(null);
    }
  }

  return (
    <PageTemplate title="Compliance Calendar" subtitle="Statutory and audit due dates" icon={CalendarClock}>
      <div className="flex justify-end mb-3">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition">
          <Plus className="w-3.5 h-3.5" /> Add Due Date
        </button>
      </div>

      <DataTable<CalendarItem>
        columns={[
          { key: "title", header: "Title" },
          { key: "companyName", header: "Company", render: (r) => r.companyName || "Platform-wide" },
          { key: "dueDate", header: "Due Date", render: (r) => formatDate(r.dueDate) },
          { key: "frequency", header: "Frequency", render: (r) => (r.frequency || "-").replace(/_/g, " ") },
          { key: "assignedTo", header: "Assigned To", render: (r) => r.assignedTo || "-" },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status || "pending"} /> },
          { key: "actions", header: "", render: (r) => r.status !== "completed" ? (
            <button onClick={() => complete(r.id)} disabled={actingId === r.id} className="flex items-center gap-1 text-xs text-green-700 hover:underline disabled:opacity-50">
              <Check className="w-3 h-3" /> Mark Done
            </button>
          ) : <span className="text-xs text-gray-400">Done</span> },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No compliance due dates configured yet"
      />

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Add Compliance Due Date"
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" placeholder="e.g. PF Return Filing" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Company (leave blank for platform-wide)</label>
            <select value={form.employerId} onChange={(e) => setForm((f) => ({ ...f, employerId: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
              <option value="">Platform-wide</option>
              {employers.map((e) => <option key={e.id} value={e.id}>{e.companyName}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
              <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
              <select value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
                <option value="one_time">One Time</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Assigned To</label>
            <input value={form.assignedTo} onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
        </div>
      </Modal>
    </PageTemplate>
  );
}
