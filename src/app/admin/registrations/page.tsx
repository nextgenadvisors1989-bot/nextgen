"use client";

import { useEffect, useState, useCallback } from "react";
import { Users, ArrowRight, X } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface Registration {
  id: number; registrationNumber: string | null; entityType: string; entityId: number | null;
  status: string; createdAt: string; entityName: string;
}

export default function AdminRegistrationsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Registration[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [entityType, setEntityType] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Registration | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (entityType) params.set("entityType", entityType);
      if (status) params.set("status", status);
      const res = await fetch(`/api/admin/registrations?${params}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.registrations);
      setTotal(json.data.total);
    } catch (err) {
      toast.error("Failed to load registrations", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, entityType, status]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function advance(id: number) {
    setActingId(id);
    try {
      const res = await fetch(`/api/admin/registrations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success(json.data.message);
      fetchRows();
    } catch (err) {
      toast.error("Failed to advance", err instanceof Error ? err.message : undefined);
    } finally {
      setActingId(null);
    }
  }

  async function reject() {
    if (!rejectTarget || !rejectReason.trim()) { toast.warning("Rejection reason required"); return; }
    setActingId(rejectTarget.id);
    try {
      const res = await fetch(`/api/admin/registrations/${rejectTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejectionReason: rejectReason }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Registration rejected");
      setRejectTarget(null);
      fetchRows();
    } catch (err) {
      toast.error("Failed to reject", err instanceof Error ? err.message : undefined);
    } finally {
      setActingId(null);
    }
  }

  return (
    <PageTemplate title="Registrations" subtitle="Auditor and Employer registration pipeline" icon={Users}>
      <div className="flex items-center gap-3 mb-4">
        <select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} className="text-sm border border-gray-300 rounded-lg px-3 py-2">
          <option value="">All Types</option>
          <option value="employer">Employer</option>
          <option value="auditor">Auditor</option>
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="text-sm border border-gray-300 rounded-lg px-3 py-2">
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="pending_documents">Pending Documents</option>
          <option value="documents_verified">Documents Verified</option>
          <option value="assessed">Assessed</option>
          <option value="approved">Approved</option>
          <option value="pending_activation">Pending Activation</option>
          <option value="active">Active</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <DataTable<Registration>
        columns={[
          { key: "registrationNumber", header: "Registration ID", render: (r) => r.registrationNumber || `#${r.id}` },
          { key: "entityType", header: "Type", render: (r) => <span className="capitalize">{r.entityType}</span> },
          { key: "entityName", header: "Name" },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "createdAt", header: "Created", render: (r) => formatDate(r.createdAt) },
          { key: "actions", header: "Actions", render: (r) => r.status !== "active" && r.status !== "rejected" ? (
            <div className="flex items-center gap-2">
              <button onClick={() => advance(r.id)} disabled={actingId === r.id} className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50">
                Advance <ArrowRight className="w-3 h-3" />
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
        emptyMessage="No registrations found"
      />

      <Modal
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject Registration"
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
