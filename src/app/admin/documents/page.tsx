"use client";

import { useEffect, useState, useCallback } from "react";
import { FileText, Check, X, RefreshCw } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface DocRow {
  id: number; ownerType: string; ownerName: string; documentType: string; fileName: string | null; fileUrl: string | null;
  status: string; rejectionReason: string | null; expiryDate: string | null; createdAt: string;
}

export default function AdminDocumentsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<DocRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [ownerType, setOwnerType] = useState("");
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<DocRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (ownerType) params.set("ownerType", ownerType);
      if (status) params.set("status", status);
      const res = await fetch(`/api/admin/documents?${params}`);
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
  }, [page, pageSize, ownerType, status]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function verify(id: number) {
    setActingId(id);
    try {
      const res = await fetch(`/api/admin/documents/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify" }),
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
    if (!rejectTarget || !rejectReason.trim()) { toast.warning("Rejection reason required"); return; }
    setActingId(rejectTarget.id);
    try {
      const res = await fetch(`/api/admin/documents/${rejectTarget.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejectionReason: rejectReason }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Document rejected");
      setRejectTarget(null);
      fetchRows();
    } catch (err) {
      toast.error("Failed to reject", err instanceof Error ? err.message : undefined);
    } finally {
      setActingId(null);
    }
  }

  return (
    <PageTemplate title="Documents" subtitle="Unified verification queue across the platform" icon={FileText}>
      <div className="flex items-center gap-3 mb-4">
        <select value={ownerType} onChange={(e) => { setOwnerType(e.target.value); setPage(1); }} className="text-sm border border-gray-300 rounded-lg px-3 py-2">
          <option value="">All Owners</option>
          <option value="employee">Employee</option>
          <option value="employer">Employer</option>
          <option value="auditor">Auditor</option>
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="text-sm border border-gray-300 rounded-lg px-3 py-2">
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Expired</option>
          <option value="">All</option>
        </select>
      </div>

      <DataTable<DocRow>
        columns={[
          { key: "ownerType", header: "Owner Type", render: (r) => <span className="capitalize">{r.ownerType}</span> },
          { key: "ownerName", header: "Owner" },
          { key: "documentType", header: "Document" },
          { key: "fileName", header: "File", render: (r) => r.fileUrl ? <a href={r.fileUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{r.fileName}</a> : (r.fileName || "-") },
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
          ) : r.status === "verified" ? (
            <span className="flex items-center gap-1 text-xs text-gray-400"><RefreshCw className="w-3 h-3" /> -</span>
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
            <button onClick={reject} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">Reject</button>
          </div>
        }
      >
        <label className="block text-xs font-medium text-gray-600 mb-1">Rejection Reason (mandatory)</label>
        <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
      </Modal>
    </PageTemplate>
  );
}
