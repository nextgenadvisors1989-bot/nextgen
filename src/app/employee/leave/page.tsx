"use client";

import { useEffect, useState, useCallback } from "react";
import { Calendar, Plus } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface LeaveRequest {
  id: number;
  leaveType: string;
  fromDate: string;
  toDate: string;
  days: string;
  reason: string | null;
  status: string;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

const leaveTypeLabel: Record<string, string> = {
  casual: "Casual Leave", earned: "Earned Leave", sick: "Sick Leave", lop: "Loss of Pay",
  maternity: "Maternity Leave", paternity: "Paternity Leave", festival: "Festival Holiday",
  compensatory: "Compensatory Off", other: "Other",
};

export default function EmployeeLeavePage() {
  const { success, error: showError } = useToast();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ leaveType: "casual", fromDate: "", toDate: "", reason: "" });

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/employee/leave-requests?page=${page}&pageSize=${pageSize}`);
      const data = await res.json();
      if (data.success) { setRequests(data.data.leaveRequests); setTotal(data.data.total); }
    } catch { showError("Failed to load leave requests"); }
    finally { setLoading(false); }
  }, [page, pageSize]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/employee/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || "Failed to submit"); return; }
      success("Leave request submitted successfully");
      setShowCreate(false);
      setForm({ leaveType: "casual", fromDate: "", toDate: "", reason: "" });
      fetchRequests();
    } catch { showError("Failed to submit leave request"); }
    finally { setSubmitting(false); }
  }

  const columns = [
    { key: "leaveType", header: "Leave Type", render: (r: LeaveRequest) => <span className="text-sm font-medium">{leaveTypeLabel[r.leaveType] || r.leaveType}</span> },
    { key: "period", header: "Period", render: (r: LeaveRequest) => <div><p className="text-sm">{formatDate(r.fromDate)} - {formatDate(r.toDate)}</p><p className="text-xs text-gray-500">{r.days} day(s)</p></div> },
    { key: "reason", header: "Reason", render: (r: LeaveRequest) => <p className="text-sm text-gray-600 line-clamp-2 max-w-xs">{r.reason || "-"}</p> },
    { key: "status", header: "Status", render: (r: LeaveRequest) => <StatusBadge status={r.status} /> },
    { key: "createdAt", header: "Applied", render: (r: LeaveRequest) => <span className="text-xs text-gray-500">{formatDate(r.createdAt)}</span> },
    { key: "remarks", header: "Remarks", render: (r: LeaveRequest) => r.rejectionReason ? <p className="text-xs text-red-500 max-w-xs line-clamp-2">{r.rejectionReason}</p> : <span className="text-xs text-gray-400">-</span> },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center"><Calendar className="w-5 h-5 text-white" /></div>
          <div><h1 className="text-lg font-bold text-gray-900">Leave Management</h1><p className="text-xs text-gray-500">{total} leave requests</p></div>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">
          <Plus className="w-4 h-4" />Apply Leave
        </button>
      </div>

      <DataTable columns={columns as never} data={requests as unknown as Record<string, unknown>[]} total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} loading={loading} emptyMessage="No leave requests found." keyField="id" />

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Apply for Leave" size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Leave Type *</label>
            <select required value={form.leaveType} onChange={e => setForm(f => ({ ...f, leaveType: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              {Object.entries(leaveTypeLabel).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">From Date *</label>
              <input required type="date" value={form.fromDate} onChange={e => setForm(f => ({ ...f, fromDate: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">To Date *</label>
              <input required type="date" value={form.toDate} min={form.fromDate} onChange={e => setForm(f => ({ ...f, toDate: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
            <textarea rows={3} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter reason for leave" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2">
              {submitting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Submit Request
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
