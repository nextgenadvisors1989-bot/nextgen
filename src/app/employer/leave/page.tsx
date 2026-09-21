"use client";

import { useEffect, useState, useCallback } from "react";
import { Calendar, Check, X, Filter } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface LeaveRequest {
  id: number;
  employeeId: number;
  leaveType: string;
  fromDate: string;
  toDate: string;
  days: string;
  reason: string | null;
  status: string;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  empFirstName: string | null;
  empLastName: string | null;
  empNumber: string | null;
}

export default function EmployerLeavePage() {
  const { success, error: showError } = useToast();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionRequest, setActionRequest] = useState<{ request: LeaveRequest; action: "approve" | "reject" } | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status) params.set("status", status);
      const res = await fetch(`/api/employer/leave-requests?${params}`);
      const data = await res.json();
      if (data.success) { setRequests(data.data.leaveRequests); setTotal(data.data.total); }
    } catch { showError("Failed to load leave requests"); }
    finally { setLoading(false); }
  }, [page, pageSize, status]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  async function handleAction() {
    if (!actionRequest) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/employer/leave-requests/${actionRequest.request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionRequest.action, rejectionReason }),
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || "Failed to process"); return; }
      success(`Leave request ${actionRequest.action}d`);
      setActionRequest(null);
      setRejectionReason("");
      fetchRequests();
    } catch { showError("Failed to process leave request"); }
    finally { setProcessing(false); }
  }

  const leaveTypeLabel: Record<string, string> = {
    casual: "Casual Leave", earned: "Earned Leave", sick: "Sick Leave", lop: "Loss of Pay",
    maternity: "Maternity Leave", paternity: "Paternity Leave", festival: "Festival Holiday",
    compensatory: "Compensatory Off", other: "Other",
  };

  const columns = [
    { key: "employee", header: "Employee", render: (r: LeaveRequest) => <div><p className="font-medium text-gray-900">{r.empFirstName} {r.empLastName}</p><p className="text-xs text-gray-500">{r.empNumber}</p></div> },
    { key: "leaveType", header: "Leave Type", render: (r: LeaveRequest) => <span className="text-sm">{leaveTypeLabel[r.leaveType] || r.leaveType}</span> },
    { key: "period", header: "Period", render: (r: LeaveRequest) => <div><p className="text-sm">{formatDate(r.fromDate)} - {formatDate(r.toDate)}</p><p className="text-xs text-gray-500">{r.days} day(s)</p></div> },
    { key: "reason", header: "Reason", render: (r: LeaveRequest) => <p className="text-sm text-gray-600 max-w-xs line-clamp-2">{r.reason || "-"}</p> },
    { key: "status", header: "Status", render: (r: LeaveRequest) => <StatusBadge status={r.status} /> },
    { key: "createdAt", header: "Applied", render: (r: LeaveRequest) => <span className="text-xs text-gray-500">{formatDate(r.createdAt)}</span> },
    { key: "actions", header: "Actions", render: (r: LeaveRequest) => (
      r.status === "pending" ? (
        <div className="flex items-center gap-2">
          <button onClick={() => setActionRequest({ request: r, action: "approve" })} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
            <Check className="w-3 h-3" />Approve
          </button>
          <button onClick={() => { setActionRequest({ request: r, action: "reject" }); }} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition">
            <X className="w-3 h-3" />Reject
          </button>
        </div>
      ) : <span className="text-xs text-gray-400">{r.approvedAt ? formatDate(r.approvedAt) : "-"}</span>
    )},
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-orange-600 flex items-center justify-center"><Calendar className="w-5 h-5 text-white" /></div>
          <div><h1 className="text-lg font-bold text-gray-900">Leave Management</h1><p className="text-xs text-gray-500">{total} leave requests</p></div>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none bg-white">
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <DataTable columns={columns as never} data={requests as unknown as Record<string, unknown>[]} total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} loading={loading} emptyMessage="No leave requests found." keyField="id" />

      <Modal
        isOpen={!!actionRequest}
        onClose={() => { setActionRequest(null); setRejectionReason(""); }}
        title={actionRequest?.action === "approve" ? "Approve Leave Request" : "Reject Leave Request"}
        size="sm"
      >
        <div className="space-y-4">
          {actionRequest && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <p className="font-medium">{actionRequest.request.empFirstName} {actionRequest.request.empLastName}</p>
              <p className="text-gray-500">{leaveTypeLabel[actionRequest.request.leaveType]} - {actionRequest.request.days} day(s)</p>
              <p className="text-gray-500">{formatDate(actionRequest.request.fromDate)} to {formatDate(actionRequest.request.toDate)}</p>
            </div>
          )}
          {actionRequest?.action === "reject" && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Rejection Reason *</label>
              <textarea required rows={3} value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button onClick={() => { setActionRequest(null); setRejectionReason(""); }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            <button
              onClick={handleAction}
              disabled={processing || (actionRequest?.action === "reject" && !rejectionReason)}
              className={`px-4 py-2 text-sm text-white rounded-lg transition disabled:opacity-50 flex items-center gap-2 ${actionRequest?.action === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
            >
              {processing && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {actionRequest?.action === "approve" ? "Approve" : "Reject"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
