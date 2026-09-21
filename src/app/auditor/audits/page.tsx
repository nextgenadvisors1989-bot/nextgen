"use client";

import { useEffect, useState, useCallback } from "react";
import { ClipboardCheck, Plus, Search, Eye, Edit2 } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

interface Audit {
  id: number;
  auditNumber: string | null;
  status: string;
  auditDate: string | null;
  submittedAt: string | null;
  createdAt: string;
  auditTypeName: string | null;
  companyName: string | null;
}

interface Company { id: number; companyName: string; }
interface AuditType { id: number; name: string; }

export default function AuditorAuditsPage() {
  const { success, error: showError } = useToast();
  const [auditList, setAuditList] = useState<Audit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [auditTypes, setAuditTypes] = useState<AuditType[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ auditTypeId: "", employerId: "", auditDate: "" });

  const fetchAudits = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status) params.set("status", status);
      const res = await fetch(`/api/auditor/audits?${params}`);
      const data = await res.json();
      if (data.success) { setAuditList(data.data.audits); setTotal(data.data.total); }
    } catch { showError("Failed to load audits"); }
    finally { setLoading(false); }
  }, [page, pageSize, status]);

  useEffect(() => { fetchAudits(); }, [fetchAudits]);

  useEffect(() => {
    fetch("/api/auditor/assigned-companies").then(r => r.json()).then(d => {
      if (d.success) setCompanies(d.data.companies || []);
    }).catch(() => {});
    fetch("/api/auditor/audit-types").then(r => r.json()).then(d => {
      if (d.success) setAuditTypes(d.data.auditTypes || []);
    }).catch(() => {});
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/auditor/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || "Failed to create audit"); return; }
      success("Audit created. You can now fill in the form.");
      setShowCreate(false);
      setForm({ auditTypeId: "", employerId: "", auditDate: "" });
      fetchAudits();
    } catch { showError("Failed to create audit"); }
    finally { setSubmitting(false); }
  }

  const columns = [
    { key: "auditNumber", header: "Audit No.", render: (r: Audit) => <span className="text-xs font-mono text-gray-600">{r.auditNumber || "-"}</span> },
    { key: "companyName", header: "Company", render: (r: Audit) => <span className="font-medium text-gray-900">{r.companyName || "-"}</span> },
    { key: "auditTypeName", header: "Audit Type", render: (r: Audit) => <span className="text-sm">{r.auditTypeName || "-"}</span> },
    { key: "auditDate", header: "Audit Date", render: (r: Audit) => <span className="text-sm">{formatDate(r.auditDate)}</span> },
    { key: "status", header: "Status", render: (r: Audit) => <StatusBadge status={r.status} /> },
    { key: "submittedAt", header: "Submitted", render: (r: Audit) => <span className="text-xs text-gray-500">{formatDate(r.submittedAt)}</span> },
    { key: "actions", header: "Actions", render: (r: Audit) => (
      <div className="flex items-center gap-2">
        <Link href={`/auditor/audits/${r.id}`} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition">
          {r.status === "draft" || r.status === "revision_requested" ? <Edit2 className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </Link>
      </div>
    )},
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center"><ClipboardCheck className="w-5 h-5 text-white" /></div>
          <div><h1 className="text-lg font-bold text-gray-900">My Audits</h1><p className="text-xs text-gray-500">{total} total audits</p></div>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition">
          <Plus className="w-4 h-4" />New Audit
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none bg-white">
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="under_review">Under Review</option>
          <option value="revision_requested">Revision Requested</option>
          <option value="approved">Approved</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <DataTable columns={columns as never} data={auditList as unknown as Record<string, unknown>[]} total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} loading={loading} emptyMessage="No audits found. Start a new audit." keyField="id" />

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Start New Audit" size="md">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Company *</label>
            <select required value={form.employerId} onChange={e => setForm(f => ({ ...f, employerId: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Select company</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Audit Type *</label>
            <select required value={form.auditTypeId} onChange={e => setForm(f => ({ ...f, auditTypeId: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Select audit type</option>
              {auditTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Audit Date</label>
            <input type="date" value={form.auditDate} onChange={e => setForm(f => ({ ...f, auditDate: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition disabled:opacity-50 flex items-center gap-2">
              {submitting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Start Audit
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
