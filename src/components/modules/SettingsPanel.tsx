"use client";

import { useEffect, useState } from "react";
import { BellRing, Check, MoonStar, Palette, ShieldCheck, UserRound } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

interface SettingsState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  theme: "light" | "dark" | "system";
  emailAlerts: boolean;
  pushAlerts: boolean;
  weeklyDigest: boolean;
}

const defaultState: SettingsState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  theme: "light",
  emailAlerts: true,
  pushAlerts: true,
  weeklyDigest: true,
};

export function SettingsPanel() {
  const toast = useToast();
  const [form, setForm] = useState<SettingsState>(defaultState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Failed to load settings");
        setForm({ ...defaultState, ...json.data.user, ...json.data.preferences });
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to save settings");
      toast.success("Settings saved", "Your preferences were updated successfully.");
    } catch (error) {
      toast.error("Save failed", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading settings...</div>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-slate-100 p-2 text-slate-700">
            <UserRound className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900">Profile settings</p>
            <p className="text-xs text-slate-500">Update your identity and contact details</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-slate-600">
            <span>First name</span>
            <input
              value={form.firstName}
              onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:bg-white"
            />
          </label>

          <label className="space-y-2 text-sm text-slate-600">
            <span>Last name</span>
            <input
              value={form.lastName}
              onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:bg-white"
            />
          </label>

          <label className="space-y-2 text-sm text-slate-600 md:col-span-2">
            <span>Email</span>
            <input
              value={form.email}
              disabled
              className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-slate-500"
            />
          </label>

          <label className="space-y-2 text-sm text-slate-600 md:col-span-2">
            <span>Phone</span>
            <input
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:bg-white"
            />
          </label>
        </div>
      </div>

      <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-violet-100 p-2 text-violet-700">
            <Palette className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900">Preferences</p>
            <p className="text-xs text-slate-500">Customize the experience</p>
          </div>
        </div>

        <div className="space-y-4">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            <span className="flex items-center gap-2"><MoonStar className="h-4 w-4" /> Theme</span>
            <select
              value={form.theme}
              onChange={(e) => setForm((prev) => ({ ...prev, theme: e.target.value as SettingsState["theme"] }))}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </label>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            <span className="flex items-center gap-2"><BellRing className="h-4 w-4" /> Email alerts</span>
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, emailAlerts: !prev.emailAlerts }))}
              className={form.emailAlerts ? "rounded-full bg-blue-600 p-1" : "rounded-full bg-slate-300 p-1"}
              aria-label="Toggle email alerts"
            >
              <span className={form.emailAlerts ? "ml-4 block h-4 w-4 rounded-full bg-white" : "block h-4 w-4 rounded-full bg-white"} />
            </button>
          </label>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Push notifications</span>
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, pushAlerts: !prev.pushAlerts }))}
              className={form.pushAlerts ? "rounded-full bg-emerald-600 p-1" : "rounded-full bg-slate-300 p-1"}
              aria-label="Toggle push alerts"
            >
              <span className={form.pushAlerts ? "ml-4 block h-4 w-4 rounded-full bg-white" : "block h-4 w-4 rounded-full bg-white"} />
            </button>
          </label>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            <span className="flex items-center gap-2"><Check className="h-4 w-4" /> Weekly digest</span>
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, weeklyDigest: !prev.weeklyDigest }))}
              className={form.weeklyDigest ? "rounded-full bg-violet-600 p-1" : "rounded-full bg-slate-300 p-1"}
              aria-label="Toggle weekly digest"
            >
              <span className={form.weeklyDigest ? "ml-4 block h-4 w-4 rounded-full bg-white" : "block h-4 w-4 rounded-full bg-white"} />
            </button>
          </label>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {saving ? "Saving..." : "Save preferences"}
        </button>
      </div>
    </div>
  );
}
