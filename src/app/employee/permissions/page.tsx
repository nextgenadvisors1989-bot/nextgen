"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock3, Plus } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface PermRow {
  id: number;
  type: string;
  date: string;
  fromTime: string | null;
  toTime: string | null;
  reason: string | null;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
}

const TYPES = [
  { value: "late_arrival", label: "Late Arrival" },
  { value: "early_departure", label: "Early Departure" },
  { value: "short_permission", label: "Short Permission" },
  { value: "missed_punch", label: "Missed Punch" },
  { value: "overtime", label: "Overtime Permission" },
  { value: "alternate_location", label: "Alternate Work Location" },
];

export default function EmployeePermissionsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<PermRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: TYPES[0].value, date: "", fromTime: "", toTime: "", reason: "" });
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/employee/permissions?page=${page}&pageSize=${pageSize}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.requests);
      setTotal(json.data.total);
    } catch (err) {
      toast.error("Failed to load requests", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  function openNew() {
    setForm({ type: TYPES[0].value, date: new Date().toISOString().slice(0, 10), fromTime: "", toTime: "", reason: "" });
    setOpen(true);
  }

  async function submit() {
    if (!form.date) { toast.warning("Date is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/employee/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Request submitted");
      setOpen(false);
      fetchRows();
    } catch (err) {
      toast.error("Failed to submit", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageTemplate title="Permission Requests" subtitle="Late arrival, early departure and other requests" icon={Clock3}>
      <div className="flex justify-end mb-3">
        <button onClick={openNew} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition">
          <Plus className="w-3.5 h-3.5" /> New Request
        </button>
      </div>

      <DataTable<PermRow>
        columns={[
          { key: "type", header: "Type", render: (r) => TYPES.find((t) => t.value === r.type)?.label || r.type },
          { key: "date", header: "Date", render: (r) => formatDate(r.date) },
          { key: "time", header: "Time", render: (r) => r.fromTime && r.toTime ? `${r.fromTime} - ${r.toTime}` : "-" },
          { key: "reason", header: "Reason" },
          { key: "status", header: "Status", render: (r) => (
            <div>
              <StatusBadge status={r.status} />
              {r.status === "rejected" && r.rejectionReason && <p className="text-xs text-red-600 mt-1">{r.rejectionReason}</p>}
            </div>
          ) },
        ]}
        data={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        loading={loading}
        emptyMessage="No permission requests yet"
      />

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="New Permission Request"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Submitting..." : "Submit"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From Time</label>
              <input type="time" value={form.fromTime} onChange={(e) => setForm((f) => ({ ...f, fromTime: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To Time</label>
              <input type="time" value={form.toTime} onChange={(e) => setForm((f) => ({ ...f, toTime: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
            <textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} rows={3} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
        </div>
      </Modal>
    </PageTemplate>
  );
}
