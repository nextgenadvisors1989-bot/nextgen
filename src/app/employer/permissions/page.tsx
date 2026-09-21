"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock3, Check, X } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface PermRow {
  id: number;
  employeeId: number;
  type: string;
  date: string;
  fromTime: string | null;
  toTime: string | null;
  reason: string | null;
  status: string;
  firstName: string;
  lastName: string | null;
  employeeNumber: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  late_arrival: "Late Arrival", early_departure: "Early Departure", short_permission: "Short Permission",
  missed_punch: "Missed Punch", overtime: "Overtime Permission", alternate_location: "Alternate Location",
};

export default function EmployerPermissionsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<PermRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PermRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/employer/permissions?${params}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.requests);
      setTotal(json.data.total);
    } catch (err) {
      toast.error("Failed to load requests", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, statusFilter]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function approve(id: number) {
    setActingId(id);
    try {
      const res = await fetch(`/api/employer/permissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Request approved");
      fetchRows();
    } catch (err) {
      toast.error("Failed to approve", err instanceof Error ? err.message : undefined);
    } finally {
      setActingId(null);
    }
  }

  async function reject() {
    if (!rejectTarget || !rejectReason.trim()) { toast.warning("Rejection reason required"); return; }
    setActingId(rejectTarget.id);
    try {
      const res = await fetch(`/api/employer/permissions/${rejectTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejectionReason: rejectReason }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Request rejected");
      setRejectTarget(null);
      fetchRows();
    } catch (err) {
      toast.error("Failed to reject", err instanceof Error ? err.message : undefined);
    } finally {
      setActingId(null);
    }
  }

  return (
    <PageTemplate title="Permission Requests" subtitle="Approve employee permission requests" icon={Clock3}>
      <div className="flex items-center gap-3 mb-4">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="text-sm border border-gray-300 rounded-lg px-3 py-2">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </select>
      </div>

      <DataTable<PermRow>
        columns={[
          { key: "employee", header: "Employee", render: (r) => `${r.firstName} ${r.lastName || ""} (${r.employeeNumber || "-"})` },
          { key: "type", header: "Type", render: (r) => TYPE_LABELS[r.type] || r.type },
          { key: "date", header: "Date", render: (r) => formatDate(r.date) },
          { key: "time", header: "Time", render: (r) => r.fromTime && r.toTime ? `${r.fromTime} - ${r.toTime}` : "-" },
          { key: "reason", header: "Reason", render: (r) => r.reason || "-" },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "actions", header: "Actions", render: (r) => r.status === "pending" ? (
            <div className="flex items-center gap-2">
              <button onClick={() => approve(r.id)} disabled={actingId === r.id} className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                <Check className="w-3 h-3" /> Approve
              </button>
              <button onClick={() => { setRejectTarget(r); setRejectReason(""); }} disabled={actingId === r.id} className="flex items-center gap-1 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
                <X className="w-3 h-3" /> Reject
              </button>
            </div>
          ) : <span className="text-xs text-gray-400">-</span> },
        ]}
        data={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        loading={loading}
        emptyMessage="No permission requests"
      />

      <Modal
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject Permission Request"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setRejectTarget(null)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={reject} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">Reject</button>
          </div>
        }
      >
        <label className="block text-xs font-medium text-gray-600 mb-1">Rejection Reason</label>
        <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
      </Modal>
    </PageTemplate>
  );
}
