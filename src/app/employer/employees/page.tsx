"use client";

import { useEffect, useState, useCallback } from "react";
import { Users, Plus, Search, Edit2, Trash2, Eye } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

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
  deptName: string | null;
  desigName: string | null;
  createdAt: string;
}

interface Department { id: number; name: string; }

export default function EmployerEmployeesPage() {
  const { success, error: showError } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [employeeType, setEmployeeType] = useState("");
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deleteEmp, setDeleteEmp] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      if (employeeType) params.set("employeeType", employeeType);
      const res = await fetch(`/api/employer/employees?${params}`);
      const data = await res.json();
      if (data.success) { setEmployees(data.data.employees); setTotal(data.data.total); }
    } catch { showError("Failed to load employees"); }
    finally { setLoading(false); }
  }, [page, pageSize, search, status, employeeType]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  useEffect(() => {
    fetch("/api/employer/departments").then(r => r.json()).then(d => {
      if (d.success) setDepartments(d.data.departments || []);
    }).catch(() => {});
  }, []);

  async function handleDelete() {
    if (!deleteEmp) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/employer/employees/${deleteEmp.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { showError(data.error); return; }
      success("Employee deactivated");
      setDeleteEmp(null);
      fetchEmployees();
    } catch { showError("Failed to deactivate employee"); }
    finally { setDeleting(false); }
  }

  const columns = [
    { key: "employeeNumber", header: "Emp No.", render: (r: Employee) => <span className="text-xs font-mono text-gray-600">{r.employeeNumber || "-"}</span> },
    { key: "name", header: "Employee", render: (r: Employee) => <div><p className="font-medium text-gray-900">{r.firstName} {r.lastName}</p><p className="text-xs text-gray-500">{r.email || r.phone || "-"}</p></div> },
    { key: "department", header: "Dept / Designation", render: (r: Employee) => <div><p className="text-sm text-gray-700">{r.deptName || "-"}</p><p className="text-xs text-gray-400">{r.desigName || "-"}</p></div> },
    { key: "employeeType", header: "Type", render: (r: Employee) => <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 capitalize">{r.employeeType}</span> },
    { key: "joiningDate", header: "Joining", render: (r: Employee) => <span className="text-xs text-gray-500">{formatDate(r.joiningDate)}</span> },
    { key: "status", header: "Status", render: (r: Employee) => <StatusBadge status={r.status} /> },
    { key: "actions", header: "Actions", render: (r: Employee) => (
      <div className="flex items-center gap-2">
        <Link href={`/employer/employees/${r.id}`} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"><Eye className="w-4 h-4" /></Link>
        <Link href={`/employer/employees/${r.id}/edit`} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition"><Edit2 className="w-4 h-4" /></Link>
        <button onClick={() => setDeleteEmp(r)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"><Trash2 className="w-4 h-4" /></button>
      </div>
    )},
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-600 flex items-center justify-center"><Users className="w-5 h-5 text-white" /></div>
          <div><h1 className="text-lg font-bold text-gray-900">Employees</h1><p className="text-xs text-gray-500">{total} total employees</p></div>
        </div>
        <Link href="/employer/employees/new" className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition">
          <Plus className="w-4 h-4" />Add Employee
        </Link>
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

      <DataTable columns={columns as never} data={employees as unknown as Record<string, unknown>[]} total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} loading={loading} emptyMessage="No employees found. Add your first employee." keyField="id" />

      <ConfirmDialog isOpen={!!deleteEmp} onClose={() => setDeleteEmp(null)} onConfirm={handleDelete} title="Deactivate Employee" message={`Deactivate ${deleteEmp?.firstName} ${deleteEmp?.lastName}?`} confirmLabel="Deactivate" loading={deleting} />
    </div>
  );
}
