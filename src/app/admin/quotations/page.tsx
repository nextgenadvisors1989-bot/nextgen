"use client";

import { useEffect, useState, useCallback } from "react";
import { Receipt, Plus } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Quotation {
  id: number; quotationNumber: string | null; employerId: number | null; title: string | null;
  description: string | null; amount: string | null; status: string | null; validUntil: string | null;
  createdAt: string; companyName: string | null;
}

interface Employer { id: number; companyName: string; }

const STATUSES = ["draft", "sent", "accepted", "rejected", "expired"];

export default function AdminQuotationsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Quotation[]>([]);
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employerId: "", title: "", description: "", amount: "", validUntil: "" });
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [qRes, eRes] = await Promise.all([fetch("/api/admin/quotations"), fetch("/api/admin/employers?pageSize=200")]);
      const qJson = await qRes.json();
      const eJson = await eRes.json();
      if (!qRes.ok || !qJson.success) throw new Error(qJson.error);
      setRows(qJson.data.quotations);
      if (eRes.ok && eJson.success) setEmployers(eJson.data.employers || []);
    } catch (err) {
      toast.error("Failed to load quotations", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function submit() {
    if (!form.title.trim() || !form.amount) { toast.warning("Title and amount are required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, employerId: form.employerId ? Number(form.employerId) : null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Quotation created");
      setOpen(false);
      setForm({ employerId: "", title: "", description: "", amount: "", validUntil: "" });
      fetchData();
    } catch (err) {
      toast.error("Failed to create quotation", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: number, status: string) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/quotations/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      fetchData();
    } catch (err) {
      toast.error("Failed to update status", err instanceof Error ? err.message : undefined);
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <PageTemplate title="Quotations" subtitle="Subscription and service quotations issued to Employers" icon={Receipt}>
      <div className="flex justify-end mb-3">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition">
          <Plus className="w-3.5 h-3.5" /> New Quotation
        </button>
      </div>

      <DataTable<Quotation>
        columns={[
          { key: "quotationNumber", header: "Quotation #", render: (r) => r.quotationNumber || `#${r.id}` },
          { key: "companyName", header: "Company", render: (r) => r.companyName || "General" },
          { key: "title", header: "Title", render: (r) => r.title || "-" },
          { key: "amount", header: "Amount", render: (r) => formatCurrency(r.amount) },
          { key: "validUntil", header: "Valid Until", render: (r) => formatDate(r.validUntil) },
          { key: "status", header: "Status", render: (r) => (
            <select
              value={r.status || "draft"}
              onChange={(e) => setStatus(r.id, e.target.value)}
              disabled={updatingId === r.id}
              className="text-xs border border-gray-300 rounded px-2 py-1 disabled:opacity-50"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No quotations created yet"
      />

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="New Quotation"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Saving..." : "Create"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Company (leave blank for general quotation)</label>
            <select value={form.employerId} onChange={(e) => setForm((f) => ({ ...f, employerId: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
              <option value="">General</option>
              {employers.map((e) => <option key={e.id} value={e.id}>{e.companyName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" placeholder="e.g. Annual Compliance Package" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₹)</label>
              <input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Valid Until</label>
              <input type="date" value={form.validUntil} onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
          </div>
        </div>
      </Modal>
    </PageTemplate>
  );
}
