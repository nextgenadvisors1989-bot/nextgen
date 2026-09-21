"use client";

import { useEffect, useState, useCallback } from "react";
import { FileText, Check, X } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface DocRow {
  id: number;
  ownerType: string;
  documentType: string;
  fileName: string | null;
  fileUrl: string | null;
  status: string;
  rejectionReason: string | null;
  expiryDate: string | null;
  createdAt: string;
  employeeFirstName: string | null;
  employeeLastName: string | null;
  employeeNumber: string | null;
}

export default function EmployerDocumentsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<DocRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const [rejectTarget, setRejectTarget] = useState<DocRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actingId, setActingId] = useState<number | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/employer/documents?${params}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.documents);
      setTotal(json.data.total);
    } catch (err) {
      toast.error("Failed to load documents", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, statusFilter]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function verify(id: number) {
    setActingId(id);
    try {
      const res = await fetch(`/api/employer/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Document verified");
      fetchRows();
    } catch (err) {
      toast.error("Failed to verify", err instanceof Error ? err.message : undefined);
    } finally {
      setActingId(null);
    }
  }

  async function reject() {
    if (!rejectTarget || !rejectReason.trim()) { toast.warning("Rejection reason is required"); return; }
    setActingId(rejectTarget.id);
    try {
      const res = await fetch(`/api/employer/documents/${rejectTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejectionReason: rejectReason }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Document rejected");
      setRejectTarget(null);
      setRejectReason("");
      fetchRows();
    } catch (err) {
      toast.error("Failed to reject", err instanceof Error ? err.message : undefined);
    } finally {
      setActingId(null);
    }
  }

  return (
    <PageTemplate title="Documents" subtitle="Company-wide document verification queue" icon={FileText}>
      <div className="flex items-center gap-3 mb-4">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="text-sm border border-gray-300 rounded-lg px-3 py-2">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      <DataTable<DocRow>
        columns={[
          { key: "owner", header: "Owner", render: (r) => r.ownerType === "employee"
            ? `${r.employeeFirstName || ""} ${r.employeeLastName || ""} (${r.employeeNumber || "-"})`
            : r.ownerType },
          { key: "documentType", header: "Document Type" },
          { key: "fileName", header: "File", render: (r) => r.fileUrl ? (
            <a href={r.fileUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{r.fileName}</a>
          ) : (r.fileName || "-") },
          { key: "status", header: "Status", render: (r) => (
            <div>
              <StatusBadge status={r.status} />
              {r.status === "rejected" && r.rejectionReason && <p className="text-xs text-red-600 mt-1">{r.rejectionReason}</p>}
            </div>
          ) },
          { key: "createdAt", header: "Uploaded", render: (r) => formatDate(r.createdAt) },
          { key: "actions", header: "Actions", render: (r) => r.status === "pending" ? (
            <div className="flex items-center gap-2">
              <button onClick={() => verify(r.id)} disabled={actingId === r.id} className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                <Check className="w-3 h-3" /> Verify
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
        emptyMessage="No documents found"
      />

      <Modal
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject Document"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setRejectTarget(null)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={reject} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">Reject Document</button>
          </div>
        }
      >
        <label className="block text-xs font-medium text-gray-600 mb-1">Rejection Reason (mandatory)</label>
        <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
      </Modal>
    </PageTemplate>
  );
}
