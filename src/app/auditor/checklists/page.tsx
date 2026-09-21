"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, ArrowRight } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";

interface Company { employerId: number; companyName: string; }
interface AuditType { id: number; name: string; category: string | null; description: string | null; }

export default function AuditorChecklistsPage() {
  const router = useRouter();
  const toast = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [auditTypes, setAuditTypes] = useState<AuditType[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [auditTypeId, setAuditTypeId] = useState("");
  const [auditDate, setAuditDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, tRes] = await Promise.all([
        fetch("/api/auditor/assigned-companies"),
        fetch("/api/auditor/audit-types"),
      ]);
      const cJson = await cRes.json();
      const tJson = await tRes.json();
      if (!cRes.ok || !cJson.success) throw new Error(cJson.error);
      if (!tRes.ok || !tJson.success) throw new Error(tJson.error);
      setCompanies(cJson.data.companies);
      setAuditTypes(tJson.data.auditTypes);
    } catch (err) {
      toast.error("Failed to load", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function startAudit() {
    if (!companyId || !auditTypeId) { toast.warning("Select a company and audit type"); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/auditor/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employerId: Number(companyId), auditTypeId: Number(auditTypeId), auditDate }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Audit created — fill in the form");
      router.push(`/auditor/audits/${json.data.audit.id}`);
    } catch (err) {
      toast.error("Failed to start audit", err instanceof Error ? err.message : undefined);
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <LoadingState message="Loading your assignments..." />;

  return (
    <PageTemplate title="Checklist & Forms" subtitle="Only forms matching your assigned role and company appear here" icon={ListChecks}>
      {companies.length === 0 || auditTypes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200">
          <EmptyState
            icon={ListChecks}
            title="Nothing available yet"
            description={companies.length === 0 ? "You haven't been assigned to any companies yet." : "No audit types match your assigned auditor role yet."}
          />
        </div>
      ) : (
        <div className="max-w-lg bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Assigned Company</label>
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
                <option value="">Select company</option>
                {companies.map((c) => <option key={c.employerId} value={c.employerId}>{c.companyName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Audit Type (filtered to your role)</label>
              <select value={auditTypeId} onChange={(e) => setAuditTypeId(e.target.value)} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
                <option value="">Select audit type</option>
                {auditTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {auditTypeId && (
                <p className="text-xs text-gray-400 mt-1">{auditTypes.find((t) => String(t.id) === auditTypeId)?.description}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Audit Date</label>
              <input type="date" value={auditDate} onChange={(e) => setAuditDate(e.target.value)} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <button
              onClick={startAudit}
              disabled={creating}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-700 text-white rounded-lg font-medium hover:bg-blue-800 transition disabled:opacity-50"
            >
              {creating ? "Creating..." : "Start Audit"} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </PageTemplate>
  );
}
