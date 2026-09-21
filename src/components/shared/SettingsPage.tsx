"use client";

import { useEffect, useState, useCallback } from "react";
import { Settings, KeyRound } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { LoadingState } from "@/components/ui/LoadingState";
import { useToast } from "@/components/ui/Toast";

interface Me {
  email: string; role: string;
}

export function SettingsPageContent() {
  const toast = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [saving, setSaving] = useState(false);

  const fetchMe = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/me");
      const json = await res.json();
      if (res.ok && json.success) setMe(json.data.user || json.data);
    } catch {
      // non-critical — page still works without this
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  async function changePassword() {
    if (!form.currentPassword || !form.newPassword) { toast.warning("Fill in both password fields"); return; }
    if (form.newPassword.length < 8) { toast.warning("New password must be at least 8 characters"); return; }
    if (form.newPassword !== form.confirmPassword) { toast.warning("New passwords don't match"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to change password");
      toast.success("Password changed");
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      toast.error("Failed to change password", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState message="Loading settings..." />;

  return (
    <PageTemplate title="Settings" subtitle="Account and security" icon={Settings}>
      {me && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5 max-w-lg">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Account</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Email</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">{me.email}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Role</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5 capitalize">{me.role?.replace(/_/g, " ")}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 max-w-lg">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <KeyRound className="w-4 h-4" /> Change Password
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Current Password</label>
            <input type="password" value={form.currentPassword} onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">New Password</label>
            <input type="password" value={form.newPassword} onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Confirm New Password</label>
            <input type="password" value={form.confirmPassword} onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <button onClick={changePassword} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
            {saving ? "Updating..." : "Update Password"}
          </button>
          <p className="text-xs text-gray-400">Changing your password will sign you out of all other devices.</p>
        </div>
      </div>
    </PageTemplate>
  );
}
