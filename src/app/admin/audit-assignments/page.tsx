"use client";

import { useEffect, useState, useCallback } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface Assignment {
  id: number; auditorId: number; employerId: number; startDate: string | null; endDate: string | null;
  isActive: boolean; notes: string | null; auditorFirstName: string; auditorLastName: string | null; companyName: string;
}

interface Auditor { id: number; firstName: string; lastName: string | null; }
interface Employer { id: number; companyName: string; }

export default function AdminAuditAssignmentsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Assignment[]>([]);
  const [auditors, setAuditors] = useState<Auditor[]>([]);
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ auditorId: "", employerId: "", startDate: "", endDate: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, auRes, emRes] = await Promise.all([
        fetch("/api/admin/audit-assignments"),
        fetch("/api/admin/auditors?pageSize=200&status=active"),
        fetch("/api/admin/employers?pageSize=200&status=active"),
      ]);
      const aJson = await aRes.json();
      const auJson = await auRes.json();
      const emJson = await emRes.json();
      if (!aRes.ok || !aJson.success) throw new Error(aJson.error);
      setRows(aJson.data.assignments);
      if (auRes.ok && auJson.success) setAuditors(auJson.data.auditors || []);
      if (emRes.ok && emJson.success) setEmployers(emJson.data.employers || []);
    } catch (err) {
      toast.error("Failed to load assignments", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function submit() {
    if (!form.auditorId || !form.employerId) { toast.warning("Auditor and company are required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/audit-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, auditorId: Number(form.auditorId), employerId: Number(form.employerId) }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Auditor assigned");
      setOpen(false);
      setForm({ auditorId: "", employerId: "", startDate: "", endDate: "", notes: "" });
      fetchData();
    } catch (err) {
      toast.error("Failed to assign", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(a: Assignment) {
    setTogglingId(a.id);
    try {
      const res = await fetch(`/api/admin/audit-assignments/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !a.isActive }),
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
    <PageTemplate title="Audit Assignments" subtitle="Assign auditors to employer companies" icon={ClipboardList}>
      <div className="flex justify-end mb-3">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition">
          <Plus className="w-3.5 h-3.5" /> New Assignment
        </button>
      </div>

      <DataTable<Assignment>
        columns={[
          { key: "auditor", header: "Auditor", render: (r) => `${r.auditorFirstName} ${r.auditorLastName || ""}` },
          { key: "companyName", header: "Company" },
          { key: "validity", header: "Validity", render: (r) => `${formatDate(r.startDate)} — ${formatDate(r.endDate)}` },
          { key: "notes", header: "Notes", render: (r) => r.notes || "-" },
          { key: "isActive", header: "Status", render: (r) => (
            <button onClick={() => toggle(r)} disabled={togglingId === r.id} className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${r.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
              {r.isActive ? "Active" : "Inactive"}
            </button>
          ) },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No auditor assignments yet"
      />

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="New Audit Assignment"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Saving..." : "Assign"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Auditor</label>
            <select value={form.auditorId} onChange={(e) => setForm((f) => ({ ...f, auditorId: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
              <option value="">Select auditor</option>
              {auditors.map((a) => <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
            <select value={form.employerId} onChange={(e) => setForm((f) => ({ ...f, employerId: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
              <option value="">Select company</option>
              {employers.map((e) => <option key={e.id} value={e.id}>{e.companyName}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
        </div>
      </Modal>
    </PageTemplate>
  );
}
