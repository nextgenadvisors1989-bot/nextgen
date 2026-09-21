"use client";

import { useEffect, useState, useCallback } from "react";
import { Network, Plus } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface Department {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
}

export default function EmployerDepartmentsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/employer/departments");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.departments);
    } catch (err) {
      toast.error("Failed to load departments", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function submit() {
    if (!form.name.trim()) { toast.warning("Department name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/employer/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Department created");
      setOpen(false);
      setForm({ name: "", description: "" });
      fetchRows();
    } catch (err) {
      toast.error("Failed to create department", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageTemplate title="Departments" subtitle="Manage your company's department master" icon={Network}>
      <div className="flex justify-end mb-3">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition">
          <Plus className="w-3.5 h-3.5" /> Add Department
        </button>
      </div>

      <DataTable<Department>
        columns={[
          { key: "name", header: "Department" },
          { key: "description", header: "Description", render: (r) => r.description || "-" },
          { key: "createdAt", header: "Created", render: (r) => formatDate(r.createdAt) },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No departments yet — add your first one (e.g. Cutting, Production, Quality, Maintenance)"
      />

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Add Department"
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Department Name</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" placeholder="e.g. Cutting" />
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
