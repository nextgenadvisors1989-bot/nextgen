"use client";

import { useEffect, useState, useCallback } from "react";
import { Scale, Plus } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

interface Act {
  id: number; name: string; shortName: string | null; description: string | null;
  applicableStates: string[] | null; isActive: boolean;
}

export default function AdminLegalMasterPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Act[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", shortName: "", description: "", applicableStates: "" });
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/legal-master");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.acts);
    } catch (err) {
      toast.error("Failed to load legal acts", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function submit() {
    if (!form.name.trim()) { toast.warning("Act name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/legal-master", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Legal act added");
      setOpen(false);
      setForm({ name: "", shortName: "", description: "", applicableStates: "" });
      fetchRows();
    } catch (err) {
      toast.error("Failed to add", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(a: Act) {
    setTogglingId(a.id);
    try {
      const res = await fetch(`/api/admin/legal-master/${a.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !a.isActive }),
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
    <PageTemplate title="Legal Master" subtitle="Statutory acts referenced by audit findings" icon={Scale}>
      <div className="flex justify-end mb-3">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition">
          <Plus className="w-3.5 h-3.5" /> Add Act
        </button>
      </div>

      <DataTable<Act>
        columns={[
          { key: "name", header: "Act Name" },
          { key: "shortName", header: "Short Name", render: (r) => r.shortName || "-" },
          { key: "applicableStates", header: "Applicable States", render: (r) => r.applicableStates?.join(", ") || "All India" },
          { key: "isActive", header: "Status", render: (r) => (
            <button onClick={() => toggle(r)} disabled={togglingId === r.id} className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${r.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
              {r.isActive ? "Active" : "Inactive"}
            </button>
          ) },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No legal acts added yet"
      />

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Add Legal Act"
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Act Name</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" placeholder="e.g. Factories Act, 1948" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Short Name</label>
            <input value={form.shortName} onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" placeholder="e.g. Factories Act" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Applicable States (comma-separated, blank = All India)</label>
            <input value={form.applicableStates} onChange={(e) => setForm((f) => ({ ...f, applicableStates: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
        </div>
      </Modal>
    </PageTemplate>
  );
}
