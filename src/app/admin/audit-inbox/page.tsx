"use client";

import { useEffect, useState, useCallback } from "react";
import { Inbox, Check, X, RotateCcw, Download } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

interface Audit {
  id: number; auditNumber: string | null; status: string; auditDate: string | null; submittedAt: string | null; pdfUrl: string | null;
  auditTypeName: string; companyName: string; auditorFirstName: string; auditorLastName: string | null;
  findingsCount: number; criticalFindings: number;
}

export default function AdminAuditInboxPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Audit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState("submitted");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);
  const [revisionTarget, setRevisionTarget] = useState<Audit | null>(null);
  const [revisionNotes, setRevisionNotes] = useState("");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status) params.set("status", status);
      const res = await fetch(`/api/admin/audit-inbox?${params}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.audits);
      setTotal(json.data.total);
    } catch (err) {
      toast.error("Failed to load audit inbox", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, status]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function act(id: number, action: "approve" | "reject", notes?: string) {
    setActingId(id);
    try {
      const res = await fetch(`/api/admin/audit-inbox/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reviewNotes: notes }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success(json.data.message);
      fetchRows();
    } catch (err) {
      toast.error("Failed to update", err instanceof Error ? err.message : undefined);
    } finally {
      setActingId(null);
    }
  }

  async function requestRevision() {
    if (!revisionTarget || !revisionNotes.trim()) { toast.warning("Revision notes required"); return; }
    setActingId(revisionTarget.id);
    try {
      const res = await fetch(`/api/admin/audit-inbox/${revisionTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_revision", reviewNotes: revisionNotes }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Revision requested");
      setRevisionTarget(null);
      fetchRows();
    } catch (err) {
      toast.error("Failed to request revision", err instanceof Error ? err.message : undefined);
    } finally {
      setActingId(null);
    }
  }

  return (
    <PageTemplate title="Audit Inbox" subtitle="Review submitted audits across every company" icon={Inbox}>
      <div className="flex items-center gap-3 mb-4">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="text-sm border border-gray-300 rounded-lg px-3 py-2">
          <option value="submitted">Submitted</option>
          <option value="under_review">Under Review</option>
          <option value="revision_requested">Revision Requested</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </select>
      </div>

      <DataTable<Audit>
        columns={[
          { key: "auditNumber", header: "Audit #", render: (r) => r.auditNumber || `#${r.id}` },
          { key: "companyName", header: "Company" },
          { key: "auditTypeName", header: "Audit Type" },
          { key: "auditor", header: "Auditor", render: (r) => `${r.auditorFirstName} ${r.auditorLastName || ""}` },
          { key: "submittedAt", header: "Submitted", render: (r) => formatDate(r.submittedAt) },
          { key: "findings", header: "Findings", render: (r) => (
            <span>{r.findingsCount} {r.criticalFindings > 0 && <span className="text-red-600 font-semibold">({r.criticalFindings} critical)</span>}</span>
          ) },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "actions", header: "Actions", render: (r) => (
            <div className="flex items-center gap-2">
              {r.pdfUrl && <a href={r.pdfUrl} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-blue-600"><Download className="w-3.5 h-3.5" /></a>}
              {(r.status === "submitted" || r.status === "under_review") && (
                <>
                  <button onClick={() => act(r.id, "approve")} disabled={actingId === r.id} className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                    <Check className="w-3 h-3" /> Approve
                  </button>
                  <button onClick={() => { setRevisionTarget(r); setRevisionNotes(""); }} disabled={actingId === r.id} className="flex items-center gap-1 px-2 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50">
                    <RotateCcw className="w-3 h-3" /> Revise
                  </button>
                  <button onClick={() => act(r.id, "reject")} disabled={actingId === r.id} className="flex items-center gap-1 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
                    <X className="w-3 h-3" /> Reject
                  </button>
                </>
              )}
              <Link href={`/auditor/audits/${r.id}`} className="text-xs text-gray-500 hover:underline">View</Link>
            </div>
          ) },
        ]}
        data={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        loading={loading}
        emptyMessage="No audits in this status"
      />

      <Modal
        isOpen={!!revisionTarget}
        onClose={() => setRevisionTarget(null)}
        title="Request Revision"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setRevisionTarget(null)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={requestRevision} className="px-4 py-2 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600">Request Revision</button>
          </div>
        }
      >
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes for the auditor</label>
        <textarea value={revisionNotes} onChange={(e) => setRevisionNotes(e.target.value)} rows={3} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
      </Modal>
    </PageTemplate>
  );
}
