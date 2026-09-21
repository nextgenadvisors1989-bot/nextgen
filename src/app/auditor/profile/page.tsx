"use client";

import { useEffect, useState, useCallback } from "react";
import { UserCircle, Pencil } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

interface Auditor {
  id: number; firstName: string; lastName: string | null; email: string; phone: string | null;
  organization: string | null; assessorNumber: string | null; experience: number | null;
  qualification: string | null; certification: string | null; state: string | null; district: string | null;
  languages: string[] | null; status: string; validityStart: string | null; validityEnd: string | null;
}

const EDITABLE_FIELDS = ["phone", "state", "district", "qualification", "experience"] as const;

export default function AuditorProfilePage() {
  const toast = useToast();
  const [auditor, setAuditor] = useState<Auditor | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auditor/profile");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load profile");
      setAuditor(json.data.auditor);
      setRoles(json.data.roles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  function openEdit() {
    if (!auditor) return;
    const initial: Record<string, string> = {};
    EDITABLE_FIELDS.forEach((f) => { initial[f] = String(auditor[f] ?? ""); });
    setForm(initial);
    setEditOpen(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const res = await fetch("/api/auditor/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Update failed");
      toast.success("Profile updated");
      setEditOpen(false);
      fetchProfile();
    } catch (err) {
      toast.error("Update failed", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState message="Loading your profile..." />;
  if (error) return <ErrorState message={error} onRetry={fetchProfile} />;
  if (!auditor) return null;

  return (
    <PageTemplate title="My Profile" subtitle="Personal and professional details" icon={UserCircle}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-900">{auditor.firstName} {auditor.lastName}</h2>
          <StatusBadge status={auditor.status} />
        </div>
        <button onClick={openEdit} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition">
          <Pencil className="w-3.5 h-3.5" /> Edit Profile
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Roles &amp; Assignment (Admin-controlled)</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {roles.length > 0 ? roles.map((r) => <span key={r} className="text-xs px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full">{r}</span>) : <span className="text-xs text-gray-400">No roles assigned yet</span>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            ["Assessor Number", auditor.assessorNumber], ["Organization", auditor.organization],
            ["Validity", auditor.validityStart && auditor.validityEnd ? `${auditor.validityStart} — ${auditor.validityEnd}` : "-"],
          ].map(([label, value]) => (
            <div key={label as string}>
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">{value || "-"}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Personal Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            ["Email", auditor.email], ["Mobile", auditor.phone], ["State", auditor.state], ["District", auditor.district],
            ["Experience (years)", auditor.experience], ["Qualification", auditor.qualification],
            ["Languages", auditor.languages?.join(", ") || "-"], ["Certifications", auditor.certification],
          ].map(([label, value]) => (
            <div key={label as string}>
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">{value || "-"}</p>
            </div>
          ))}
        </div>
      </div>

      <Modal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Profile"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={saveEdit} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500">Auditor Role, Scope, Assessor Number and Credential Validity are Admin-controlled and can't be edited here.</p>
          {EDITABLE_FIELDS.map((field) => (
            <div key={field}>
              <label className="block text-xs font-medium text-gray-600 mb-1 capitalize">{field.replace(/([A-Z])/g, " $1")}</label>
              <input
                value={form[field] || ""}
                onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>
      </Modal>
    </PageTemplate>
  );
}
