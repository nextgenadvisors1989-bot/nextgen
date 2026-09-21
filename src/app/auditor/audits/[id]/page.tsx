"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ClipboardCheck, Save, Send, Plus, ArrowLeft } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import Link from "next/link";

interface FormField { key: string; label: string; type: "text" | "textarea" | "number" | "select" | "date" | "checkbox"; options?: string[]; }
interface FormSection { title: string; fields: FormField[]; }
interface FormSchema { sections: FormSection[]; }

interface AuditDetail {
  id: number; auditNumber: string | null; status: string; auditDate: string | null;
  formData: Record<string, unknown> | null; signatureData: string | null; notes: string | null;
  auditTypeName: string | null; companyName: string | null; formSchema: FormSchema | null;
}

interface Finding {
  id: number; findingNumber: string | null; description: string; severity: string | null;
  status: string | null; targetDate: string | null; correctiveAction: string | null; responsiblePerson: string | null;
}

const DEFAULT_SECTIONS: FormSection[] = [
  { title: "General Audit Details", fields: [
    { key: "site", label: "Site / Location", type: "text" },
    { key: "contactPerson", label: "Contact Person", type: "text" },
    { key: "objective", label: "Audit Objective", type: "textarea" },
  ] },
];

export default function AuditorAuditDetailPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const auditId = params.id as string;

  const [audit, setAudit] = useState<AuditDetail | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signature, setSignature] = useState("");

  const [findingOpen, setFindingOpen] = useState(false);
  const [findingForm, setFindingForm] = useState({ description: "", severity: "medium", legalRequirement: "", responsiblePerson: "", targetDate: "", correctiveAction: "", evidenceUrl: "" });
  const [savingFinding, setSavingFinding] = useState(false);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [aRes, fRes] = await Promise.all([
        fetch(`/api/auditor/audits/${auditId}`),
        fetch(`/api/auditor/audits/${auditId}/findings`),
      ]);
      const aJson = await aRes.json();
      const fJson = await fRes.json();
      if (!aRes.ok || !aJson.success) throw new Error(aJson.error || "Failed to load audit");
      setAudit(aJson.data.audit);
      setFormData(aJson.data.audit.formData || {});
      setSignature(aJson.data.audit.signatureData || "");
      if (fRes.ok && fJson.success) setFindings(fJson.data.findings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditId]);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  const editable = audit?.status === "draft" || audit?.status === "revision_requested";

  function updateField(key: string, value: unknown) {
    setFormData((f) => {
      const next = { ...f, [key]: value };
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => saveDraft(next), 1200);
      return next;
    });
  }

  async function saveDraft(data?: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/auditor/audits/${auditId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formData: data || formData, signatureData: signature }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
    } catch (err) {
      toast.error("Autosave failed", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function submitAudit() {
    if (!signature.trim()) { toast.warning("Digital signature required before submitting"); return; }
    setSubmitting(true);
    try {
      await saveDraft();
      const res = await fetch(`/api/auditor/audits/${auditId}/submit`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Audit submitted");
      fetchAudit();
    } catch (err) {
      toast.error("Failed to submit", err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitFinding() {
    if (!findingForm.description.trim()) { toast.warning("Description is required"); return; }
    setSavingFinding(true);
    try {
      const res = await fetch(`/api/auditor/audits/${auditId}/findings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(findingForm),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Finding added");
      setFindingOpen(false);
      setFindingForm({ description: "", severity: "medium", legalRequirement: "", responsiblePerson: "", targetDate: "", correctiveAction: "", evidenceUrl: "" });
      fetchAudit();
    } catch (err) {
      toast.error("Failed to add finding", err instanceof Error ? err.message : undefined);
    } finally {
      setSavingFinding(false);
    }
  }

  if (loading) return <LoadingState message="Loading audit..." />;
  if (error) return <ErrorState message={error} onRetry={fetchAudit} />;
  if (!audit) return null;

  const sections = audit.formSchema?.sections?.length ? audit.formSchema.sections : DEFAULT_SECTIONS;

  return (
    <PageTemplate title={audit.auditTypeName || "Audit"} subtitle={`${audit.companyName || ""} — ${audit.auditNumber || ""}`} icon={ClipboardCheck}>
      <div className="flex items-center justify-between mb-4">
        <Link href="/auditor/audits" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" /> Back to My Audits
        </Link>
        <div className="flex items-center gap-3">
          {saving && <span className="text-xs text-gray-400">Saving...</span>}
          <StatusBadge status={audit.status} />
        </div>
      </div>

      {!audit.formSchema?.sections?.length && (
        <p className="text-xs text-gray-400 mb-3">
          No custom form has been published for this audit type yet — using a general-purpose checklist below.
        </p>
      )}

      <div className="space-y-5">
        {sections.map((section) => (
          <div key={section.title} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">{section.title}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {section.fields.map((field) => (
                <div key={field.key} className={field.type === "textarea" ? "md:col-span-2" : ""}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
                  {field.type === "textarea" ? (
                    <textarea
                      disabled={!editable}
                      value={(formData[field.key] as string) || ""}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      rows={3}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 disabled:bg-gray-50"
                    />
                  ) : field.type === "select" ? (
                    <select
                      disabled={!editable}
                      value={(formData[field.key] as string) || ""}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 disabled:bg-gray-50"
                    >
                      <option value="">Select</option>
                      {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : field.type === "checkbox" ? (
                    <input
                      type="checkbox"
                      disabled={!editable}
                      checked={!!formData[field.key]}
                      onChange={(e) => updateField(field.key, e.target.checked)}
                      className="w-4 h-4"
                    />
                  ) : (
                    <input
                      type={field.type}
                      disabled={!editable}
                      value={(formData[field.key] as string) || ""}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 disabled:bg-gray-50"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Findings</h3>
            {editable && (
              <button onClick={() => setFindingOpen(true)} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                <Plus className="w-3.5 h-3.5" /> Add Finding
              </button>
            )}
          </div>
          {findings.length === 0 ? (
            <p className="text-sm text-gray-400">No findings recorded — add one if this audit surfaced a non-conformance.</p>
          ) : (
            <div className="space-y-3">
              {findings.map((f) => (
                <div key={f.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-500">{f.findingNumber}</span>
                    <div className="flex gap-2">
                      {f.severity && <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full capitalize">{f.severity}</span>}
                      <StatusBadge status={f.status || "open"} />
                    </div>
                  </div>
                  <p className="text-sm text-gray-900">{f.description}</p>
                  {f.correctiveAction && <p className="text-xs text-gray-500 mt-1">Corrective action: {f.correctiveAction}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Digital Signature</h3>
          <input
            disabled={!editable}
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="Type your full name to sign"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 disabled:bg-gray-50"
          />
        </div>

        {editable && (
          <div className="flex justify-end gap-3">
            <button onClick={() => saveDraft()} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <Save className="w-4 h-4" /> Save Draft
            </button>
            <button onClick={submitAudit} disabled={submitting} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
              <Send className="w-4 h-4" /> {submitting ? "Submitting..." : "Sign & Submit"}
            </button>
          </div>
        )}
      </div>

      <Modal
        isOpen={findingOpen}
        onClose={() => setFindingOpen(false)}
        title="Add Finding"
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setFindingOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={submitFinding} disabled={savingFinding} className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {savingFinding ? "Saving..." : "Add Finding"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea value={findingForm.description} onChange={(e) => setFindingForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Severity</label>
              <select value={findingForm.severity} onChange={(e) => setFindingForm((f) => ({ ...f, severity: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Legal Reference</label>
              <input value={findingForm.legalRequirement} onChange={(e) => setFindingForm((f) => ({ ...f, legalRequirement: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Responsible Person</label>
              <input value={findingForm.responsiblePerson} onChange={(e) => setFindingForm((f) => ({ ...f, responsiblePerson: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Target Date</label>
              <input type="date" value={findingForm.targetDate} onChange={(e) => setFindingForm((f) => ({ ...f, targetDate: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Corrective Action Required</label>
            <textarea value={findingForm.correctiveAction} onChange={(e) => setFindingForm((f) => ({ ...f, correctiveAction: e.target.value }))} rows={2} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" placeholder="Leave blank if no corrective action is needed" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Evidence URL</label>
            <input value={findingForm.evidenceUrl} onChange={(e) => setFindingForm((f) => ({ ...f, evidenceUrl: e.target.value }))} placeholder="https://..." className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
        </div>
      </Modal>
    </PageTemplate>
  );
}
