"use client";

import { useEffect, useState, useCallback } from "react";
import { KeyRound, QrCode } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate } from "@/lib/utils";

interface Auditor { firstName: string; lastName: string | null; organization: string | null; assessorNumber: string | null; }
interface Credential { digitalVerificationNumber: string | null; validFrom: string | null; validTo: string | null; status: string; }

export default function AuditorCredentialsPage() {
  const [auditor, setAuditor] = useState<Auditor | null>(null);
  const [credential, setCredential] = useState<Credential | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auditor/credentials");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load credentials");
      setAuditor(json.data.auditor);
      setCredential(json.data.credential);
      setRoles(json.data.roles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load credentials");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingState message="Loading your ID card..." />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <PageTemplate title="My Credentials" subtitle="Digital Auditor ID card and verification" icon={KeyRound}>
      {!credential ? (
        <div className="bg-white rounded-xl border border-gray-200">
          <EmptyState icon={KeyRound} title="No digital credential issued yet" description="Admin hasn't issued a digital ID card for you yet." />
        </div>
      ) : (
        <div className="max-w-sm mx-auto bg-gradient-to-br from-slate-700 to-slate-900 rounded-2xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-6">
            <p className="text-xs font-medium uppercase tracking-wide opacity-90">Auditor ID Card</p>
            <StatusBadge status={credential.status} className="!bg-white/20 !text-white" />
          </div>
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-4 text-xl font-bold">
            {auditor?.firstName?.[0]}{auditor?.lastName?.[0] || ""}
          </div>
          <h2 className="text-lg font-bold">{auditor?.firstName} {auditor?.lastName}</h2>
          <p className="text-sm opacity-90 mb-1">{auditor?.organization || "-"}</p>
          <div className="flex flex-wrap gap-1 mb-4">
            {roles.map((r) => <span key={r} className="text-xs px-2 py-0.5 bg-white/20 rounded-full">{r}</span>)}
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs bg-white/10 rounded-xl p-3 mb-4">
            <div>
              <p className="opacity-70">Assessor No.</p>
              <p className="font-semibold">{auditor?.assessorNumber || "-"}</p>
            </div>
            <div>
              <p className="opacity-70">Valid To</p>
              <p className="font-semibold">{formatDate(credential.validTo)}</p>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/20 pt-4">
            <div>
              <p className="text-xs opacity-70">Verification No.</p>
              <p className="text-xs font-mono">{credential.digitalVerificationNumber}</p>
            </div>
            <QrCode className="w-10 h-10 opacity-90" />
          </div>
        </div>
      )}
    </PageTemplate>
  );
}
