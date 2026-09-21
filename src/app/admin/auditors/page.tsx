"use client";

import { useEffect, useState, useCallback } from "react";
import { BadgeCheck, Plus, Search, Edit2, Trash2, Eye, ChevronDown } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

const AUDITOR_ROLE_TYPES = [
  "Electrical Safety Auditor","Fire Safety Auditor","Environmental Auditor","Water Audit Auditor",
  "Waste Management Auditor","Energy Auditor","GHG and Carbon Auditor","Chemical Safety Auditor",
  "Occupational Health and Safety Auditor","Factory Safety Auditor","Labour and Social Compliance Auditor",
  "Payroll and Wage Compliance Auditor","Food Safety Auditor","ETP / STP Assessment Auditor",
  "Risk Assessment Auditor","HAZOP Auditor","HACCP Auditor","Work Permit System Auditor",
  "ESG and Sustainability Auditor","General Compliance Auditor",
];

interface Auditor {
  id: number;
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  organization: string | null;
  assessorNumber: string | null;
  state: string | null;
  status: string;
  registrationId: string | null;
  roles: string[];
  createdAt: string;
}

interface RoleType { id: number; name: string; }

interface AssignmentRow {
  id: number; employerId: number; companyName: string; industry: string | null; state: string | null;
  startDate: string | null; endDate: string | null; isActive: boolean;
}

interface AuditRow {
  id: number; auditNumber: string | null; status: string; auditDate: string | null; submittedAt: string | null;
  companyName: string; auditTypeName: string;
}

export default function AdminAuditorsPage() {
  const { success, error: showError } = useToast();
  const [auditors, setAuditors] = useState<Auditor[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [roleTypeId, setRoleTypeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editAuditor, setEditAuditor] = useState<Auditor | null>(null);
  const [deleteAuditor, setDeleteAuditor] = useState<Auditor | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [viewAuditor, setViewAuditor] = useState<Auditor | null>(null);
  const [overview, setOverview] = useState<{ roles: { id: number; name: string }[]; assignments: AssignmentRow[]; audits: AuditRow[] } | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    organization: "", assessorNumber: "", experience: "",
    qualification: "", certification: "", state: "", district: "",
    validityStart: "", validityEnd: "", maxActiveAssignments: "5",
    roleTypeIds: [] as number[],
  });

  const fetchAuditors = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      if (roleTypeId) params.set("roleTypeId", roleTypeId);
      const res = await fetch(`/api/admin/auditors?${params}`);
      const data = await res.json();
      if (data.success) {
        setAuditors(data.data.auditors);
        setTotal(data.data.total);
      }
    } catch { showError("Failed to load auditors"); }
    finally { setLoading(false); }
  }, [page, pageSize, search, status, roleTypeId]);

  useEffect(() => { fetchAuditors(); }, [fetchAuditors]);

  useEffect(() => {
    fetch("/api/admin/auditor-role-types").then(r => r.json()).then(d => {
      if (d.success) setRoleTypes(d.data.roleTypes);
    }).catch(() => {});
  }, []);

  function toggleRole(id: number) {
    setForm(f => ({
      ...f,
      roleTypeIds: f.roleTypeIds.includes(id)
        ? f.roleTypeIds.filter(r => r !== id)
        : [...f.roleTypeIds, id],
    }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/auditors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || "Failed to create auditor"); return; }
      success("Auditor created", `Temporary password: ${data.data.tempPassword}`);
      setShowCreate(false);
      resetForm();
      fetchAuditors();
    } catch { showError("Failed to create auditor"); }
    finally { setSubmitting(false); }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editAuditor) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/auditors/${editAuditor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || "Failed to update auditor"); return; }
      success("Auditor updated successfully");
      setEditAuditor(null);
      resetForm();
      fetchAuditors();
    } catch { showError("Failed to update auditor"); }
    finally { setSubmitting(false); }
  }

  async function handleDelete() {
    if (!deleteAuditor) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/auditors/${deleteAuditor.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { showError(data.error || "Failed to deactivate"); return; }
      success("Auditor deactivated");
      setDeleteAuditor(null);
      fetchAuditors();
    } catch { showError("Failed to deactivate auditor"); }
    finally { setDeleting(false); }
  }

  function resetForm() {
    setForm({
      firstName: "", lastName: "", email: "", phone: "",
      organization: "", assessorNumber: "", experience: "",
      qualification: "", certification: "", state: "", district: "",
      validityStart: "", validityEnd: "", maxActiveAssignments: "5",
      roleTypeIds: [],
    });
  }

  function openEdit(auditor: Auditor) {
    setForm({
      firstName: auditor.firstName,
      lastName: auditor.lastName || "",
      email: auditor.email,
      phone: auditor.phone || "",
      organization: auditor.organization || "",
      assessorNumber: auditor.assessorNumber || "",
      experience: "",
      qualification: "",
      certification: "",
      state: auditor.state || "",
      district: "",
      validityStart: "",
      validityEnd: "",
      maxActiveAssignments: "5",
      roleTypeIds: [],
    });
    setEditAuditor(auditor);
  }

  async function resetPassword() {
    if (!editAuditor) return;
    setResettingPassword(true);
    setGeneratedPassword("");
    try {
      const res = await fetch(`/api/admin/auditors/${editAuditor.id}/reset-password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: resetPasswordValue || undefined }),
      });
      const data = await res.json();
      if (!data.success) { showError(data.error || "Failed to reset password"); return; }
      setGeneratedPassword(data.data.newPassword);
      setResetPasswordValue("");
      success("Password reset — share this with the auditor");
    } catch { showError("Failed to reset password"); }
    finally { setResettingPassword(false); }
  }

  async function openView(auditor: Auditor) {
    setViewAuditor(auditor);
    setOverview(null);
    setOverviewLoading(true);
    try {
      const res = await fetch(`/api/admin/auditors/${auditor.id}/overview`);
      const data = await res.json();
      if (data.success) setOverview(data.data);
      else showError(data.error || "Failed to load auditor overview");
    } catch { showError("Failed to load auditor overview"); }
    finally { setOverviewLoading(false); }
  }

  const columns = [
    { key: "registrationId", header: "ID", render: (r: Auditor) => <span className="text-xs font-mono text-gray-500">{r.registrationId || "-"}</span> },
    { key: "name", header: "Name", render: (r: Auditor) => <div><p className="font-medium text-gray-900">{r.firstName} {r.lastName}</p><p className="text-xs text-gray-500">{r.email}</p></div> },
    { key: "organization", header: "Organization", render: (r: Auditor) => <span className="text-sm">{r.organization || "-"}</span> },
    { key: "roles", header: "Roles", render: (r: Auditor) => (
      <div className="flex flex-wrap gap-1">
        {r.roles.length === 0 ? <span className="text-xs text-gray-400">No roles</span> :
          r.roles.slice(0, 2).map(role => <span key={role} className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">{role.replace(" Auditor", "")}</span>)}
        {r.roles.length > 2 && <span className="text-xs text-gray-400">+{r.roles.length - 2}</span>}
      </div>
    )},
    { key: "status", header: "Status", render: (r: Auditor) => <StatusBadge status={r.status} /> },
    { key: "actions", header: "Actions", render: (r: Auditor) => (
      <div className="flex items-center gap-2">
        <button onClick={() => openView(r)} className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded transition" title="View assigned companies & audits">
          <Eye className="w-4 h-4" />
        </button>
        <button onClick={() => openEdit(r)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition" title="Edit">
          <Edit2 className="w-4 h-4" />
        </button>
        <button onClick={() => setDeleteAuditor(r)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition" title="Deactivate">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    )},
  ];

  const AuditorForm = ({ onSubmit, isEdit }: { onSubmit: (e: React.FormEvent) => void; isEdit?: boolean }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">First Name *</label>
          <input required value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Last Name</label>
          <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
          <input required type="email" disabled={isEdit} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
          <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Organization</label>
          <input value={form.organization} onChange={e => setForm(f => ({ ...f, organization: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Assessor Number</label>
          <input value={form.assessorNumber} onChange={e => setForm(f => ({ ...f, assessorNumber: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Experience (years)</label>
          <input type="number" value={form.experience} onChange={e => setForm(f => ({ ...f, experience: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Validity Start</label>
          <input type="date" value={form.validityStart} onChange={e => setForm(f => ({ ...f, validityStart: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Validity End</label>
          <input type="date" value={form.validityEnd} onChange={e => setForm(f => ({ ...f, validityEnd: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">State</label>
          <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Max Active Assignments</label>
          <input type="number" value={form.maxActiveAssignments} onChange={e => setForm(f => ({ ...f, maxActiveAssignments: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">Audit Roles (select all that apply)</label>
        <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
          {roleTypes.map(rt => (
            <label key={rt.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={form.roleTypeIds.includes(rt.id)}
                onChange={() => toggleRole(rt.id)}
                className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
              />
              <span className="text-sm text-gray-700">{rt.name}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={() => { setShowCreate(false); setEditAuditor(null); resetForm(); }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition">Cancel</button>
        <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition disabled:opacity-50 flex items-center gap-2">
          {submitting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {isEdit ? "Update Auditor" : "Create Auditor"}
        </button>
      </div>
    </form>
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center">
            <BadgeCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Auditors</h1>
            <p className="text-xs text-gray-500">{total} total auditors</p>
          </div>
        </div>
        <button onClick={() => { resetForm(); setShowCreate(true); }} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition">
          <Plus className="w-4 h-4" />
          Create Auditor
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search auditors..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="pending_activation">Pending Activation</option>
          <option value="suspended">Suspended</option>
          <option value="inactive">Inactive</option>
        </select>
        <select value={roleTypeId} onChange={e => { setRoleTypeId(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">All Audit Types</option>
          {roleTypes.map(rt => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
        </select>
      </div>

      <DataTable
        columns={columns as never}
        data={auditors as unknown as Record<string, unknown>[]}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        loading={loading}
        emptyMessage="No auditors found"
        keyField="id"
      />

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); resetForm(); }} title="Create Auditor" size="2xl">
        <AuditorForm onSubmit={handleCreate} />
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!editAuditor} onClose={() => { setEditAuditor(null); resetForm(); setResetPasswordValue(""); setGeneratedPassword(""); }} title="Edit Auditor" size="2xl">
        <AuditorForm onSubmit={handleUpdate} isEdit />
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Reset Login Password</h4>
          <p className="text-xs text-gray-500 mb-3">Type a new password (min 8 chars), or leave blank to auto-generate one.</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="New password (optional)"
              value={resetPasswordValue}
              onChange={(e) => setResetPasswordValue(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={resetPassword}
              disabled={resettingPassword}
              className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50 whitespace-nowrap"
            >
              {resettingPassword ? "Resetting..." : "Reset Password"}
            </button>
          </div>
          {generatedPassword && (
            <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
              <p className="text-xs text-yellow-800">New password (share with auditor now — it won't be shown again):</p>
              <p className="text-sm font-mono font-semibold text-yellow-900 mt-1">{generatedPassword}</p>
            </div>
          )}
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteAuditor}
        onClose={() => setDeleteAuditor(null)}
        onConfirm={handleDelete}
        title="Deactivate Auditor"
        message={`Are you sure you want to deactivate ${deleteAuditor?.firstName} ${deleteAuditor?.lastName}? This will disable their account.`}
        confirmLabel="Deactivate"
        loading={deleting}
      />
      {/* View Overview Modal */}
      <Modal isOpen={!!viewAuditor} onClose={() => { setViewAuditor(null); setOverview(null); }} title={viewAuditor ? `${viewAuditor.firstName} ${viewAuditor.lastName || ""} — Overview` : ""} size="2xl">
        {overviewLoading ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : overview ? (
          <div className="space-y-6">
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Assigned Roles</h4>
              <div className="flex flex-wrap gap-1.5">
                {overview.roles.length === 0 ? <span className="text-sm text-gray-400">No roles assigned</span> :
                  overview.roles.map(r => <span key={r.id} className="text-xs bg-teal-100 text-teal-700 px-2.5 py-1 rounded-full">{r.name}</span>)}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Assigned Companies ({overview.assignments.length})</h4>
              {overview.assignments.length === 0 ? (
                <p className="text-sm text-gray-400">Not assigned to any company yet — assign from Audit Assignments.</p>
              ) : (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                  {overview.assignments.map(a => (
                    <div key={a.id} className="px-3 py-2 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{a.companyName}</p>
                        <p className="text-xs text-gray-500">{a.industry || "-"} · {a.state || "-"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">{formatDate(a.startDate)} — {formatDate(a.endDate)}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${a.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{a.isActive ? "Active" : "Inactive"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Audit History ({overview.audits.length})</h4>
              {overview.audits.length === 0 ? (
                <p className="text-sm text-gray-400">No audits conducted yet.</p>
              ) : (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                  {overview.audits.map(a => (
                    <div key={a.id} className="px-3 py-2 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{a.auditNumber || `#${a.id}`} — {a.auditTypeName}</p>
                        <p className="text-xs text-gray-500">{a.companyName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">{formatDate(a.auditDate)}</p>
                        <StatusBadge status={a.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Failed to load.</p>
        )}
      </Modal>
    </div>
  );
}
