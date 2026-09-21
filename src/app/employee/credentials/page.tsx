"use client";

import { useEffect, useState, useCallback } from "react";
import { KeyRound, QrCode } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate } from "@/lib/utils";

interface EmployeeInfo {
  employeeNumber: string | null;
  firstName: string;
  lastName: string | null;
  employeeType: string;
  status: string;
  companyName: string | null;
  deptName: string | null;
  desigName: string | null;
}

interface Credential {
  credentialId: string | null;
  digitalVerificationNumber: string | null;
  validFrom: string | null;
  validTo: string | null;
  status: string;
}

export default function EmployeeCredentialsPage() {
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);
  const [credential, setCredential] = useState<Credential | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/employee/credentials");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load credentials");
      setEmployee(json.data.employee);
      setCredential(json.data.credential);
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
    <PageTemplate title="My Credentials" subtitle="Your digital employee ID card" icon={KeyRound}>
      {!credential ? (
        <div className="bg-white rounded-xl border border-gray-200">
          <EmptyState icon={KeyRound} title="No digital credential issued yet" description="Your Admin/Employer hasn't issued a digital ID card for you yet." />
        </div>
      ) : (
        <div className="max-w-sm mx-auto bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-6">
            <p className="text-xs font-medium uppercase tracking-wide opacity-90">Employee ID Card</p>
            <StatusBadge status={credential.status} className="!bg-white/20 !text-white" />
          </div>
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-4 text-xl font-bold">
            {employee?.firstName?.[0]}{employee?.lastName?.[0] || ""}
          </div>
          <h2 className="text-lg font-bold">{employee?.firstName} {employee?.lastName}</h2>
          <p className="text-sm opacity-90">{employee?.desigName || "-"} · {employee?.deptName || "-"}</p>
          <p className="text-sm opacity-90 mb-4">{employee?.companyName}</p>

          <div className="grid grid-cols-2 gap-3 text-xs bg-white/10 rounded-xl p-3 mb-4">
            <div>
              <p className="opacity-70">Employee No.</p>
              <p className="font-semibold">{employee?.employeeNumber || "-"}</p>
            </div>
            <div>
              <p className="opacity-70">Type</p>
              <p className="font-semibold capitalize">{employee?.employeeType}</p>
            </div>
            <div>
              <p className="opacity-70">Valid From</p>
              <p className="font-semibold">{formatDate(credential.validFrom)}</p>
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
