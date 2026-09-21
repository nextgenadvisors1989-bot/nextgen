"use client";

import { useEffect, useState, useCallback } from "react";
import { KeyRound, Plus, RefreshCw, Ban, ShieldOff, ShieldCheck } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface Credential {
  id: number; credentialId: string | null; ownerType: string; ownerId: number; ownerName: string;
  digitalVerificationNumber: string | null; validFrom: string | null; validTo: string | null; status: string;
}

export default function AdminCredentialsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ownerType: "employee", ownerId: "", validityMonths: "12" });
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/credentials");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.credentials);
    } catch (err) {
      toast.error("Failed to load credentials", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function generate() {
    if (!form.ownerId) { toast.warning("Owner ID is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ownerId: Number(form.ownerId), validityMonths: Number(form.validityMonths) }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Credential generated");
      setOpen(false);
      fetchRows();
    } catch (err) {
      toast.error("Failed to generate", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function act(id: number, action: string) {
    setActingId(id);
    try {
      const res = await fetch(`/api/admin/credentials/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Credential updated");
      fetchRows();
    } catch (err) {
      toast.error("Failed to update", err instanceof Error ? err.message : undefined);
    } finally {
      setActingId(null);
    }
  }

  return (
    <PageTemplate title="Credentials" subtitle="Manage Auditor, Employer and Employee credentials" icon={KeyRound}>
      <div className="flex justify-end mb-3">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition">
          <Plus className="w-3.5 h-3.5" /> Generate Credential
        </button>
      </div>

      <DataTable<Credential>
        columns={[
          { key: "ownerType", header: "Type", render: (r) => <span className="capitalize">{r.ownerType}</span> },
          { key: "ownerName", header: "Owner" },
          { key: "credentialId", header: "Credential ID", render: (r) => r.credentialId || "-" },
          { key: "digitalVerificationNumber", header: "Verification No.", render: (r) => <span className="font-mono text-xs">{r.digitalVerificationNumber}</span> },
          { key: "validity", header: "Validity", render: (r) => `${formatDate(r.validFrom)} — ${formatDate(r.validTo)}` },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "actions", header: "Actions", render: (r) => (
            <div className="flex items-center gap-2">
              <button title="Reissue" onClick={() => act(r.id, "reissue")} disabled={actingId === r.id} className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-50"><RefreshCw className="w-3.5 h-3.5" /></button>
              {r.status === "active" ? (
                <button title="Suspend" onClick={() => act(r.id, "suspend")} disabled={actingId === r.id} className="p-1 text-gray-400 hover:text-orange-600 disabled:opacity-50"><ShieldOff className="w-3.5 h-3.5" /></button>
              ) : (
                <button title="Reactivate" onClick={() => act(r.id, "reactivate")} disabled={actingId === r.id} className="p-1 text-gray-400 hover:text-green-600 disabled:opacity-50"><ShieldCheck className="w-3.5 h-3.5" /></button>
              )}
              <button title="Revoke" onClick={() => act(r.id, "revoke")} disabled={actingId === r.id} className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-50"><Ban className="w-3.5 h-3.5" /></button>
            </div>
          ) },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No credentials issued yet"
      />

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Generate Credential"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={generate} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Generating..." : "Generate"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Owner Type</label>
            <select value={form.ownerType} onChange={(e) => setForm((f) => ({ ...f, ownerType: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
              <option value="employee">Employee</option>
              <option value="employer">Employer</option>
              <option value="auditor">Auditor</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Owner ID</label>
            <input type="number" value={form.ownerId} onChange={(e) => setForm((f) => ({ ...f, ownerId: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" placeholder="Numeric ID from the Employees/Employers/Auditors list" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Validity (months)</label>
            <input type="number" value={form.validityMonths} onChange={(e) => setForm((f) => ({ ...f, validityMonths: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
        </div>
      </Modal>
    </PageTemplate>
  );
}
