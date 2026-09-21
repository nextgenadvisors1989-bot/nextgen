"use client";

import { useEffect, useState, useCallback } from "react";
import { UserCircle, Pencil } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface Profile {
  id: number;
  employeeNumber: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  maritalStatus: string | null;
  fatherSpouseName: string | null;
  presentAddress: string | null;
  permanentAddress: string | null;
  employeeType: string;
  joiningDate: string | null;
  confirmationDate: string | null;
  workLocation: string | null;
  pfNumber: string | null;
  uan: string | null;
  esiNumber: string | null;
  bankAccount: string | null;
  bankName: string | null;
  ifsc: string | null;
  panNumber: string | null;
  qualification: string | null;
  status: string;
  companyName: string | null;
  deptName: string | null;
  desigName: string | null;
}

const EDITABLE_FIELDS = ["phone", "presentAddress", "permanentAddress", "bankAccount", "bankName", "ifsc"] as const;

export default function EmployeeProfilePage() {
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/employee/profile");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load profile");
      setProfile(json.data.employee);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  function openEdit() {
    if (!profile) return;
    const initial: Record<string, string> = {};
    EDITABLE_FIELDS.forEach((f) => { initial[f] = (profile[f] as string) || ""; });
    setForm(initial);
    setEditOpen(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const res = await fetch("/api/employee/profile", {
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
  if (!profile) return null;

  const info: [string, string | null][] = [
    ["Employee Number", profile.employeeNumber],
    ["Company", profile.companyName],
    ["Department", profile.deptName],
    ["Designation", profile.desigName],
    ["Employee Type", profile.employeeType],
    ["Joining Date", formatDate(profile.joiningDate)],
    ["Confirmation Date", formatDate(profile.confirmationDate)],
    ["Work Location", profile.workLocation],
    ["Date of Birth", formatDate(profile.dateOfBirth)],
    ["Gender", profile.gender],
    ["Marital Status", profile.maritalStatus],
    ["Father / Spouse Name", profile.fatherSpouseName],
    ["Qualification", profile.qualification],
  ];

  const statutory: [string, string | null][] = [
    ["PF Number", profile.pfNumber],
    ["UAN", profile.uan],
    ["ESI Number", profile.esiNumber],
    ["PAN", profile.panNumber],
    ["Bank Name", profile.bankName],
    ["Bank Account", profile.bankAccount ? `••••${profile.bankAccount.slice(-4)}` : null],
    ["IFSC", profile.ifsc],
  ];

  return (
    <PageTemplate title="My Profile" subtitle="Your personal and job details" icon={UserCircle}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-900">
            {profile.firstName} {profile.lastName}
          </h2>
          <StatusBadge status={profile.status} />
        </div>
        <button
          onClick={openEdit}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition"
        >
          <Pencil className="w-3.5 h-3.5" /> Edit Editable Fields
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Personal & Job Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {info.map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5 capitalize">{value || "-"}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Statutory & Bank Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {statutory.map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">{value || "-"}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Contact & Address</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500">Mobile</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">{profile.phone || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Email</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">{profile.email || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Present Address</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">{profile.presentAddress || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Permanent Address</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">{profile.permanentAddress || "-"}</p>
          </div>
        </div>
      </div>

      <Modal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Contact Details"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={saveEdit}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Only contact and bank fields can be edited here. Changes to name, department, designation or
            statutory numbers must go through your Employer / Admin.
          </p>
          {EDITABLE_FIELDS.map((field) => (
            <div key={field}>
              <label className="block text-xs font-medium text-gray-600 mb-1 capitalize">
                {field.replace(/([A-Z])/g, " $1")}
              </label>
              {field === "presentAddress" || field === "permanentAddress" ? (
                <textarea
                  value={form[field] || ""}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  rows={2}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              ) : (
                <input
                  value={form[field] || ""}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              )}
            </div>
          ))}
        </div>
      </Modal>
    </PageTemplate>
  );
}
