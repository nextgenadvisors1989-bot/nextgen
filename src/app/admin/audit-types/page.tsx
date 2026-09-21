"use client";

import { useEffect, useState, useCallback } from "react";
import { ClipboardCheck, Plus, Search, Edit2, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface AuditType {
  id: number;
  name: string;
  category: string | null;
  description: string | null;
  isActive: boolean;
  validityDays: number | null;
  createdAt: string;
  formSchema: Record<string, unknown> | null;
}

interface RoleType { id: number; name: string; }

export default function AdminAuditTypesPage() {
  const { success, error: showError } = useToast();
  const [auditTypes, setAuditTypes] = useState<AuditType[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editAuditType, setEditAuditType] = useState<AuditType | null>(null);
  const [deleteAuditType, setDeleteAuditType] = useState<AuditType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "", category: "", description: "", validityDays: "",
    roleTypeIds: [] as number[],
    formSchema: `{"sections": [{"key": "general", "title": "General Information", "fields": [{"key": "auditDate", "label": "Audit Date", "type": "date", "required": true}, {"key": "auditScope", "label": "Audit Scope", "type": "textarea", "required": true}]}]}`,
  });

  const fetchAuditTypes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/audit-types?page=${page}&pageSize=${pageSize}`);
      const data = await res.json();
      if (data.success) { setAuditTypes(data.data.auditTypes); setTotal(data.data.total); }
    } catch { showError("Failed to load audit types"); }
    finally { setLoading(false); }
  }, [page, pageSize]);

  useEffect(() => { fetchAuditTypes(); }, [fetchAuditTypes]);

  useEffect(() => {
    fetch("/api/admin/auditor-role-types").then(r => r.json()).then(d => {
      if (d.success) setRoleTypes(d.data.roleTypes);
    }).catch(() => {});
  }, []);

  function toggleRole(id: number) {
    setForm(f => ({ ...f, roleTypeIds: f.roleTypeIds.includes(id) ? f.roleTypeIds.filter(r => r !== id) : [...f.roleTypeIds, id] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      let parsedSchema;
      try { parsedSchema = JSON.parse(form.formSchema); } catch { showError("Invalid JSON in form schema"); setSubmitting(false); return; }

      const url = editAuditType ? `/api/admin/audit-types/${editAuditType.id}` : "/api/admin/audit-types";
      const method = editAuditType ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, formSchema: parsedSchema, validityDays: form.validityDays || undefined }) });
      const data = await res.json();
      if (!res.ok) { showError(data.error); return; }
      success(editAuditType ? "Audit type updated" : "Audit type created");
      setShowCreate(false);
      setEditAuditType(null);
      resetForm();
      fetchAuditTypes();
    } catch { showError("Failed to save audit type"); }
    finally { setSubmitting(false); }
  }

  async function handleToggle(auditType: AuditType) {
    try {
      const res = await fetch(`/api/admin/audit-types/${auditType.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !auditType.isActive }) });
      if (!res.ok) throw new Error();
      success(`Audit type ${auditType.isActive ? "deactivated" : "activated"}`);
      fetchAuditTypes();
    } catch { showError("Failed to toggle status"); }
  }

  async function handleDelete() {
    if (!deleteAuditType) return;
    setDeleting(true);
    try {
      await fetch(`/api/admin/audit-types/${deleteAuditType.id}`, { method: "DELETE" });
      success("Audit type deactivated");
      setDeleteAuditType(null);
      fetchAuditTypes();
    } catch { showError("Failed to deactivate"); }
    finally { setDeleting(false); }
  }

  function resetForm() {
    setForm({ name: "", category: "", description: "", validityDays: "", roleTypeIds: [], formSchema: `{"sections": []}` });
  }

  function openEdit(at: AuditType) {
    setForm({
      name: at.name,
      category: at.category || "",
      description: at.description || "",
      validityDays: at.validityDays?.toString() || "",
      roleTypeIds: [],
      formSchema: JSON.stringify(at.formSchema || { sections: [] }, null, 2),
    });
    setEditAuditType(at);
  }

  const columns = [
    { key: "name", header: "Name", render: (r: AuditType) => <div><p className="font-medium text-gray-900">{r.name}</p><p className="text-xs text-gray-500">{r.category || "Uncategorized"}</p></div> },
    { key: "description", header: "Description", render: (r: AuditType) => <p className="text-sm text-gray-600 line-clamp-2 max-w-xs">{r.description || "-"}</p> },
    { key: "validityDays", header: "Validity", render: (r: AuditType) => <span className="text-sm">{r.validityDays ? `${r.validityDays} days` : "-"}</span> },
    { key: "isActive", header: "Status", render: (r: AuditType) => <StatusBadge status={r.isActive ? "active" : "inactive"} /> },
    { key: "createdAt", header: "Created", render: (r: AuditType) => <span className="text-xs text-gray-500">{formatDate(r.createdAt)}</span> },
    { key: "actions", header: "Actions", render: (r: AuditType) => (
      <div className="flex items-center gap-2">
        <button onClick={() => openEdit(r)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"><Edit2 className="w-4 h-4" /></button>
        <button onClick={() => handleToggle(r)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition" title={r.isActive ? "Deactivate" : "Activate"}>
          {r.isActive ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4" />}
        </button>
        <button onClick={() => setDeleteAuditType(r)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"><Trash2 className="w-4 h-4" /></button>
      </div>
    )},
  ];

  const AuditTypeForm = () => (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
        <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g., Electrical Safety Audit" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
          <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Validity (days)</label>
          <input type="number" value={form.validityDays} onChange={e => setForm(f => ({ ...f, validityDays: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
        <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">Applicable Auditor Roles</label>
        <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
          {roleTypes.map(rt => (
            <label key={rt.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={form.roleTypeIds.includes(rt.id)} onChange={() => toggleRole(rt.id)} className="w-4 h-4 text-blue-600 border-gray-300 rounded" />
              <span className="text-sm text-gray-700">{rt.name}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Form Schema (JSON)</label>
        <textarea
          rows={8}
          value={form.formSchema}
          onChange={e => setForm(f => ({ ...f, formSchema: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder='{"sections": [{"key": "general", "title": "General", "fields": []}]}'
        />
        <p className="text-xs text-gray-400 mt-1">Supported field types: text, number, date, datetime, select, multiselect, toggle, textarea, file, table, signature</p>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={() => { setShowCreate(false); setEditAuditType(null); resetForm(); }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition">Cancel</button>
        <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition disabled:opacity-50 flex items-center gap-2">
          {submitting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {editAuditType ? "Update" : "Create"} Audit Type
        </button>
      </div>
    </form>
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-600 flex items-center justify-center"><ClipboardCheck className="w-5 h-5 text-white" /></div>
          <div><h1 className="text-lg font-bold text-gray-900">Audit Types & Form Builder</h1><p className="text-xs text-gray-500">{total} audit types configured</p></div>
        </div>
        <button onClick={() => { resetForm(); setShowCreate(true); }} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition">
          <Plus className="w-4 h-4" />New Audit Type
        </button>
      </div>

      <DataTable columns={columns as never} data={auditTypes as unknown as Record<string, unknown>[]} total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} loading={loading} emptyMessage="No audit types found. Create your first audit type." keyField="id" />

      <Modal isOpen={showCreate || !!editAuditType} onClose={() => { setShowCreate(false); setEditAuditType(null); resetForm(); }} title={editAuditType ? "Edit Audit Type" : "Create Audit Type"} size="2xl"><AuditTypeForm /></Modal>
      <ConfirmDialog isOpen={!!deleteAuditType} onClose={() => setDeleteAuditType(null)} onConfirm={handleDelete} title="Deactivate Audit Type" message={`Deactivate "${deleteAuditType?.name}"?`} confirmLabel="Deactivate" loading={deleting} />
    </div>
  );
}
