"use client";

import { useEffect, useState, useCallback } from "react";
import { Users, Plus, Search, Edit2, Trash2 } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface Employee {
  id: number;
  employeeNumber: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  employeeType: string;
  status: string;
  joiningDate: string | null;
  registrationId: string | null;
  companyName: string | null;
  createdAt: string;
}

interface Employer { id: number; companyName: string; }

export default function AdminEmployeesPage() {
  const { success, error: showError } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [employeeType, setEmployeeType] = useState("");
  const [loading, setLoading] = useState(false);
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteEmp, setDeleteEmp] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "",
    gender: "", maritalStatus: "", employeeType: "regular", employerId: "",
    departmentId: "", designationId: "", joiningDate: "", workLocation: "",
    pfNumber: "", uan: "", esiNumber: "", bankAccount: "", bankName: "", ifsc: "",
    panNumber: "", qualification: "", basic: "", da: "", hra: "", ta: "",
  });

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      if (employeeType) params.set("employeeType", employeeType);
      const res = await fetch(`/api/admin/employees?${params}`);
      const data = await res.json();
      if (data.success) { setEmployees(data.data.employees); setTotal(data.data.total); }
    } catch { showError("Failed to load employees"); }
    finally { setLoading(false); }
  }, [page, pageSize, search, status, employeeType]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  useEffect(() => {
    fetch("/api/admin/employers?pageSize=200").then(r => r.json()).then(d => {
      if (d.success) setEmployers(d.data.employers);
    }).catch(() => {});
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/employees", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, employerId: form.employerId ? parseInt(form.employerId) : undefined }),
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || "Failed to create employee"); return; }
      success("Employee created successfully");
      setShowCreate(false);
      setForm({ firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "", gender: "", maritalStatus: "", employeeType: "regular", employerId: "", departmentId: "", designationId: "", joiningDate: "", workLocation: "", pfNumber: "", uan: "", esiNumber: "", bankAccount: "", bankName: "", ifsc: "", panNumber: "", qualification: "", basic: "", da: "", hra: "", ta: "" });
      fetchEmployees();
    } catch { showError("Failed to create employee"); }
    finally { setSubmitting(false); }
  }

  async function handleDelete() {
    if (!deleteEmp) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/employees/${deleteEmp.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { showError(data.error); return; }
      success("Employee deactivated");
      setDeleteEmp(null);
      fetchEmployees();
    } catch { showError("Failed to deactivate"); }
    finally { setDeleting(false); }
  }

  const columns = [
    { key: "employeeNumber", header: "Emp No.", render: (r: Employee) => <span className="text-xs font-mono text-gray-600">{r.employeeNumber || "-"}</span> },
    { key: "name", header: "Employee", render: (r: Employee) => <div><p className="font-medium text-gray-900">{r.firstName} {r.lastName}</p><p className="text-xs text-gray-500">{r.email || r.phone || "-"}</p></div> },
    { key: "companyName", header: "Company", render: (r: Employee) => <span className="text-sm">{r.companyName || "-"}</span> },
    { key: "employeeType", header: "Type", render: (r: Employee) => <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 capitalize">{r.employeeType}</span> },
    { key: "joiningDate", header: "Joining", render: (r: Employee) => <span className="text-xs text-gray-500">{formatDate(r.joiningDate)}</span> },
    { key: "status", header: "Status", render: (r: Employee) => <StatusBadge status={r.status} /> },
    { key: "actions", header: "Actions", render: (r: Employee) => (
      <button onClick={() => setDeleteEmp(r)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"><Trash2 className="w-4 h-4" /></button>
    )},
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-green-600 flex items-center justify-center"><Users className="w-5 h-5 text-white" /></div>
          <div><h1 className="text-lg font-bold text-gray-900">Employees</h1><p className="text-xs text-gray-500">{total} total employees</p></div>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">
          <Plus className="w-4 h-4" />Add Employee
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search employees..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none bg-white">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="inactive">Inactive</option>
        </select>
        <select value={employeeType} onChange={e => { setEmployeeType(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none bg-white">
          <option value="">All Types</option>
          <option value="regular">Regular</option>
          <option value="temporary">Temporary</option>
          <option value="contractor">Contractor</option>
        </select>
      </div>

      <DataTable columns={columns as never} data={employees as unknown as Record<string, unknown>[]} total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} loading={loading} emptyMessage="No employees found" keyField="id" />

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Add Employee" size="2xl">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-700 mb-1">First Name *</label><input required value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Last Name</label><input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Phone</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Employer *</label>
              <select required value={form.employerId} onChange={e => setForm(f => ({ ...f, employerId: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="">Select employer</option>
                {employers.map(e => <option key={e.id} value={e.id}>{e.companyName}</option>)}
              </select>
            </div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Employee Type</label>
              <select value={form.employeeType} onChange={e => setForm(f => ({ ...f, employeeType: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="regular">Regular</option>
                <option value="temporary">Temporary</option>
                <option value="contractor">Contractor</option>
              </select>
            </div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Date of Birth</label><input type="date" value={form.dateOfBirth} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Gender</label>
              <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Joining Date</label><input type="date" value={form.joiningDate} onChange={e => setForm(f => ({ ...f, joiningDate: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Work Location</label><input value={form.workLocation} onChange={e => setForm(f => ({ ...f, workLocation: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">PF Number</label><input value={form.pfNumber} onChange={e => setForm(f => ({ ...f, pfNumber: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">ESI Number</label><input value={form.esiNumber} onChange={e => setForm(f => ({ ...f, esiNumber: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Bank Account</label><input value={form.bankAccount} onChange={e => setForm(f => ({ ...f, bankAccount: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">IFSC Code</label><input value={form.ifsc} onChange={e => setForm(f => ({ ...f, ifsc: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2">
              {submitting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Create Employee
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteEmp} onClose={() => setDeleteEmp(null)} onConfirm={handleDelete} title="Deactivate Employee" message={`Deactivate ${deleteEmp?.firstName} ${deleteEmp?.lastName}?`} confirmLabel="Deactivate" loading={deleting} />
    </div>
  );
}
