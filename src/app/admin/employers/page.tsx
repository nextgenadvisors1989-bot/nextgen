"use client";

import { useEffect, useState, useCallback } from "react";
import { Building2, Plus, Search, Edit2, Trash2 } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface Employer {
  id: number;
  registrationId: string | null;
  companyName: string;
  email: string;
  phone: string | null;
  state: string | null;
  industry: string | null;
  status: string;
  totalEmployees: number | null;
  createdAt: string;
}

export default function AdminEmployersPage() {
  const { success, error: showError } = useToast();
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editEmployer, setEditEmployer] = useState<Employer | null>(null);
  const [deleteEmployer, setDeleteEmployer] = useState<Employer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    companyName: "", tradeName: "", email: "", phone: "", address: "",
    state: "", district: "", pincode: "", industry: "", gstNumber: "",
    panNumber: "", cinNumber: "", epfRegNumber: "", esiRegNumber: "",
    contactPersonName: "", contactPersonPhone: "", website: "",
  });

  const fetchEmployers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      const res = await fetch(`/api/admin/employers?${params}`);
      const data = await res.json();
      if (data.success) { setEmployers(data.data.employers); setTotal(data.data.total); }
    } catch { showError("Failed to load employers"); }
    finally { setLoading(false); }
  }, [page, pageSize, search, status]);

  useEffect(() => { fetchEmployers(); }, [fetchEmployers]);

  function resetForm() {
    setForm({ companyName: "", tradeName: "", email: "", phone: "", address: "", state: "", district: "", pincode: "", industry: "", gstNumber: "", panNumber: "", cinNumber: "", epfRegNumber: "", esiRegNumber: "", contactPersonName: "", contactPersonPhone: "", website: "" });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/employers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { showError(data.error || "Failed to create employer"); return; }
      success("Employer created", `Temp password: ${data.data.tempPassword}`);
      setShowCreate(false);
      resetForm();
      fetchEmployers();
    } catch { showError("Failed to create employer"); }
    finally { setSubmitting(false); }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editEmployer) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/employers/${editEmployer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { showError(data.error || "Failed to update"); return; }
      success("Employer updated successfully");
      setEditEmployer(null);
      resetForm();
      fetchEmployers();
    } catch { showError("Failed to update employer"); }
    finally { setSubmitting(false); }
  }

  async function handleDelete() {
    if (!deleteEmployer) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/employers/${deleteEmployer.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { showError(data.error || "Failed to deactivate"); return; }
      success("Employer deactivated");
      setDeleteEmployer(null);
      fetchEmployers();
    } catch { showError("Failed to deactivate employer"); }
    finally { setDeleting(false); }
  }

  function openEdit(emp: Employer) {
    setForm({ companyName: emp.companyName, tradeName: "", email: emp.email, phone: emp.phone || "", address: "", state: emp.state || "", district: "", pincode: "", industry: emp.industry || "", gstNumber: "", panNumber: "", cinNumber: "", epfRegNumber: "", esiRegNumber: "", contactPersonName: "", contactPersonPhone: emp.phone || "", website: "" });
    setEditEmployer(emp);
  }

  const columns = [
    { key: "registrationId", header: "ID", render: (r: Employer) => <span className="text-xs font-mono text-gray-500">{r.registrationId || "-"}</span> },
    { key: "company", header: "Company", render: (r: Employer) => <div><p className="font-medium text-gray-900">{r.companyName}</p><p className="text-xs text-gray-500">{r.email}</p></div> },
    { key: "industry", header: "Industry", render: (r: Employer) => <span className="text-sm">{r.industry || "-"}</span> },
    { key: "state", header: "State", render: (r: Employer) => <span className="text-sm">{r.state || "-"}</span> },
    { key: "employees", header: "Employees", render: (r: Employer) => <span className="text-sm font-medium">{r.totalEmployees || 0}</span> },
    { key: "status", header: "Status", render: (r: Employer) => <StatusBadge status={r.status} /> },
    { key: "createdAt", header: "Created", render: (r: Employer) => <span className="text-xs text-gray-500">{formatDate(r.createdAt)}</span> },
    { key: "actions", header: "Actions", render: (r: Employer) => (
      <div className="flex items-center gap-2">
        <button onClick={() => openEdit(r)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"><Edit2 className="w-4 h-4" /></button>
        <button onClick={() => setDeleteEmployer(r)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"><Trash2 className="w-4 h-4" /></button>
      </div>
    )},
  ];

  const EmployerForm = ({ onSubmit, isEdit }: { onSubmit: (e: React.FormEvent) => void; isEdit?: boolean }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">Company Name *</label>
          <input required value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Trade Name</label>
          <input value={form.tradeName} onChange={e => setForm(f => ({ ...f, tradeName: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
          <input required type="email" disabled={isEdit} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
          <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Industry</label>
          <input value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">State</label>
          <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">GST Number</label>
          <input value={form.gstNumber} onChange={e => setForm(f => ({ ...f, gstNumber: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">PAN Number</label>
          <input value={form.panNumber} onChange={e => setForm(f => ({ ...f, panNumber: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">EPF Reg. Number</label>
          <input value={form.epfRegNumber} onChange={e => setForm(f => ({ ...f, epfRegNumber: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">ESI Reg. Number</label>
          <input value={form.esiRegNumber} onChange={e => setForm(f => ({ ...f, esiRegNumber: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Contact Person</label>
          <input value={form.contactPersonName} onChange={e => setForm(f => ({ ...f, contactPersonName: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">Address</label>
          <textarea rows={2} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={() => { setShowCreate(false); setEditEmployer(null); resetForm(); }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition">Cancel</button>
        <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition disabled:opacity-50 flex items-center gap-2">
          {submitting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {isEdit ? "Update Employer" : "Create Employer"}
        </button>
      </div>
    </form>
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-700 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Employers</h1>
            <p className="text-xs text-gray-500">{total} total employers</p>
          </div>
        </div>
        <button onClick={() => { resetForm(); setShowCreate(true); }} className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition">
          <Plus className="w-4 h-4" />Create Employer
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search employers..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <DataTable columns={columns as never} data={employers as unknown as Record<string, unknown>[]} total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} loading={loading} emptyMessage="No employers found" keyField="id" />

      <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); resetForm(); }} title="Create Employer" size="2xl"><EmployerForm onSubmit={handleCreate} /></Modal>
      <Modal isOpen={!!editEmployer} onClose={() => { setEditEmployer(null); resetForm(); }} title="Edit Employer" size="2xl"><EmployerForm onSubmit={handleUpdate} isEdit /></Modal>
      <ConfirmDialog isOpen={!!deleteEmployer} onClose={() => setDeleteEmployer(null)} onConfirm={handleDelete} title="Deactivate Employer" message={`Are you sure you want to deactivate ${deleteEmployer?.companyName}?`} confirmLabel="Deactivate" loading={deleting} />
    </div>
  );
}
