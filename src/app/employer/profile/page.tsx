"use client";

import { useEffect, useState, useCallback } from "react";
import { Building2, Pencil } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

interface Employer {
  id: number;
  registrationId: string | null;
  companyName: string;
  tradeName: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  state: string | null;
  district: string | null;
  pincode: string | null;
  industry: string | null;
  gstNumber: string | null;
  panNumber: string | null;
  cinNumber: string | null;
  epfRegNumber: string | null;
  esiRegNumber: string | null;
  totalEmployees: number | null;
  status: string;
  website: string | null;
  contactPersonName: string | null;
  contactPersonPhone: string | null;
}

const EDITABLE_FIELDS = ["tradeName", "phone", "address", "state", "district", "pincode", "industry", "website", "contactPersonName", "contactPersonPhone"] as const;

export default function EmployerProfilePage() {
  const toast = useToast();
  const [employer, setEmployer] = useState<Employer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/employer/profile");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load profile");
      setEmployer(json.data.employer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  function openEdit() {
    if (!employer) return;
    const initial: Record<string, string> = {};
    EDITABLE_FIELDS.forEach((f) => { initial[f] = (employer[f] as string) || ""; });
    setForm(initial);
    setEditOpen(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const res = await fetch("/api/employer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Update failed");
      toast.success("Company profile updated");
      setEditOpen(false);
      fetchProfile();
    } catch (err) {
      toast.error("Update failed", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState message="Loading company profile..." />;
  if (error) return <ErrorState message={error} onRetry={fetchProfile} />;
  if (!employer) return null;

  return (
    <PageTemplate title="Company Profile" subtitle="Statutory and contact information" icon={Building2}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-900">{employer.companyName}</h2>
          <StatusBadge status={employer.status} />
        </div>
        <button onClick={openEdit} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition">
          <Pencil className="w-3.5 h-3.5" /> Edit Profile
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Company Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            ["Registration ID", employer.registrationId], ["Trade Name", employer.tradeName],
            ["Industry", employer.industry], ["Total Employees", employer.totalEmployees],
            ["Website", employer.website], ["Email", employer.email],
          ].map(([label, value]) => (
            <div key={label as string}>
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">{value || "-"}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Statutory Registration</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            ["GST Number", employer.gstNumber], ["PAN", employer.panNumber], ["CIN", employer.cinNumber],
            ["EPF Establishment Code", employer.epfRegNumber], ["ESI Code", employer.esiRegNumber],
          ].map(([label, value]) => (
            <div key={label as string}>
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">{value || "-"}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">Statutory numbers are Admin-verified and can only be changed via Admin.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Contact & Address</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            ["Contact Person", employer.contactPersonName], ["Contact Phone", employer.contactPersonPhone],
            ["Phone", employer.phone], ["Address", employer.address], ["State", employer.state],
            ["District", employer.district], ["Pincode", employer.pincode],
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
        title="Edit Company Profile"
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={saveEdit} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          {EDITABLE_FIELDS.map((field) => (
            <div key={field} className={field === "address" ? "col-span-2" : ""}>
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
