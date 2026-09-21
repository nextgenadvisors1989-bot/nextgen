"use client";

import { useEffect, useState, useCallback } from "react";
import { FileSearch, Download, Upload } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { LoadingState } from "@/components/ui/LoadingState";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface AuditRow {
  id: number; auditNumber: string | null; auditDate: string | null; status: string; pdfUrl: string | null;
  auditTypeName: string; auditorFirstName: string; auditorLastName: string | null;
}

interface Finding {
  id: number; findingNumber: string | null; description: string; riskCategory: string | null;
  severity: string | null; legalRequirement: string | null; responsiblePerson: string | null;
  targetDate: string | null; correctiveAction: string | null; status: string | null;
}

interface CorrectiveAction {
  id: number; findingId: number; description: string; status: string | null; dueDate: string | null; evidenceUrl: string | null;
}

export default function EmployerAuditReportsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailAudit, setDetailAudit] = useState<AuditRow | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [correctives, setCorrectives] = useState<CorrectiveAction[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [evidenceTarget, setEvidenceTarget] = useState<CorrectiveAction | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/employer/audit-reports");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.audits);
    } catch (err) {
      toast.error("Failed to load audit reports", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function openDetail(audit: AuditRow) {
    setDetailAudit(audit);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/employer/audit-reports/${audit.id}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setFindings(json.data.findings);
      setCorrectiveActions(json.data.correctiveActions);
    } catch (err) {
      toast.error("Failed to load audit detail", err instanceof Error ? err.message : undefined);
    } finally {
      setDetailLoading(false);
    }
  }
  function setCorrectiveActions(v: CorrectiveAction[]) { setCorrectives(v); }

  async function submitEvidence() {
    if (!evidenceTarget || !detailAudit || !evidenceUrl.trim()) { toast.warning("Evidence URL is required"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/employer/audit-reports/${detailAudit.id}/corrective-actions/${evidenceTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidenceUrl }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Evidence submitted for auditor review");
      setEvidenceTarget(null);
      setEvidenceUrl("");
      openDetail(detailAudit);
    } catch (err) {
      toast.error("Failed to submit evidence", err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageTemplate title="Audit Reports" subtitle="Submitted audits, findings and corrective actions" icon={FileSearch}>
      <DataTable<AuditRow>
        columns={[
          { key: "auditNumber", header: "Audit #", render: (r) => r.auditNumber || `#${r.id}` },
          { key: "auditTypeName", header: "Audit Type" },
          { key: "auditor", header: "Auditor", render: (r) => `${r.auditorFirstName} ${r.auditorLastName || ""}` },
          { key: "auditDate", header: "Date", render: (r) => formatDate(r.auditDate) },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "actions", header: "", render: (r) => (
            <div className="flex items-center gap-3">
              <button onClick={() => openDetail(r)} className="text-xs text-blue-600 hover:underline">View Findings</button>
              {r.pdfUrl && <a href={r.pdfUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-gray-500 hover:underline"><Download className="w-3 h-3" /> PDF</a>}
            </div>
          ) },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No submitted audits yet"
      />

      <Modal isOpen={!!detailAudit} onClose={() => setDetailAudit(null)} title={`Audit ${detailAudit?.auditNumber || ""} — ${detailAudit?.auditTypeName || ""}`} size="xl">
        {detailLoading ? <LoadingState message="Loading findings..." /> : findings.length === 0 ? (
          <p className="text-sm text-gray-500">No findings recorded for this audit.</p>
        ) : (
          <div className="space-y-4">
            {findings.map((f) => {
              const ca = correctives.find((c) => c.findingId === f.id);
              return (
                <div key={f.id} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-500">{f.findingNumber || `Finding #${f.id}`}</span>
                    <div className="flex gap-2">
                      {f.severity && <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full capitalize">{f.severity}</span>}
                      <StatusBadge status={f.status || "open"} />
                    </div>
                  </div>
                  <p className="text-sm text-gray-900 mb-2">{f.description}</p>
                  {f.legalRequirement && <p className="text-xs text-gray-500 mb-1">Legal Reference: {f.legalRequirement}</p>}
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-2">
                    <span>Responsible: {f.responsiblePerson || "-"}</span>
                    <span>Target Date: {formatDate(f.targetDate)}</span>
                  </div>
                  {ca && (
                    <div className="bg-gray-50 rounded-lg p-3 mt-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-gray-700">Corrective Action: {ca.description}</p>
                        <StatusBadge status={ca.status || "open"} />
                      </div>
                      {ca.evidenceUrl ? (
                        <a href={ca.evidenceUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block">View submitted evidence</a>
                      ) : (
                        <button onClick={() => { setEvidenceTarget(ca); setEvidenceUrl(""); }} className="flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
                          <Upload className="w-3 h-3" /> Upload Corrective Evidence
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!evidenceTarget}
        onClose={() => setEvidenceTarget(null)}
        title="Upload Corrective Evidence"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setEvidenceTarget(null)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={submitEvidence} disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </div>
        }
      >
        <label className="block text-xs font-medium text-gray-600 mb-1">Evidence URL</label>
        <input value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} placeholder="https://..." className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
      </Modal>
    </PageTemplate>
  );
}
