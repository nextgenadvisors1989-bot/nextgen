"use client";

import { useEffect, useState, useCallback } from "react";
import { ShieldCheck, Plus } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { Modal } from "@/components/ui/Modal";
import { LoadingState } from "@/components/ui/LoadingState";
import { useToast } from "@/components/ui/Toast";

interface Role { id: number; name: string; displayName: string | null; }
interface Module { id: number; name: string; displayName: string | null; }
interface Permission { roleId: number; moduleId: number; action: string; }

const ACTIONS = ["none", "view", "create", "edit", "delete", "approve", "full"];

export default function AdminRbacPage() {
  const toast = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState<"role" | "module" | null>(null);
  const [addForm, setAddForm] = useState({ name: "", displayName: "" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/rbac");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRoles(json.data.roles);
      setModules(json.data.modules);
      setPermissions(json.data.permissions);
    } catch (err) {
      toast.error("Failed to load RBAC data", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function getAction(roleId: number, moduleId: number) {
    return permissions.find((p) => p.roleId === roleId && p.moduleId === moduleId)?.action || "none";
  }

  async function setAction(roleId: number, moduleId: number, action: string) {
    const key = `${roleId}-${moduleId}`;
    setSaving(key);
    try {
      const res = await fetch("/api/admin/rbac", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, moduleId, action }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setPermissions((prev) => {
        const filtered = prev.filter((p) => !(p.roleId === roleId && p.moduleId === moduleId));
        return [...filtered, { roleId, moduleId, action }];
      });
    } catch (err) {
      toast.error("Failed to update permission", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(null);
    }
  }

  async function submitAdd() {
    if (!addOpen || !addForm.name.trim()) { toast.warning("Name is required"); return; }
    try {
      const res = await fetch("/api/admin/rbac/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: addOpen, name: addForm.name, displayName: addForm.displayName || addForm.name }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success(`${addOpen === "role" ? "Role" : "Module"} added`);
      setAddOpen(null);
      setAddForm({ name: "", displayName: "" });
      fetchData();
    } catch (err) {
      toast.error("Failed to add", err instanceof Error ? err.message : undefined);
    }
  }

  if (loading) return <LoadingState message="Loading permission matrix..." />;

  return (
    <PageTemplate title="RBAC" subtitle="Role × Module permission matrix" icon={ShieldCheck}>
      <div className="flex justify-end gap-2 mb-4">
        <button onClick={() => setAddOpen("role")} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
          <Plus className="w-3 h-3" /> Add Role
        </button>
        <button onClick={() => setAddOpen("module")} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
          <Plus className="w-3 h-3" /> Add Module
        </button>
      </div>

      {roles.length === 0 || modules.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
          Add at least one role and one module to start building the permission matrix.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Module</th>
                {roles.map((r) => <th key={r.id} className="text-left px-4 py-3 font-semibold text-gray-700">{r.displayName || r.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => (
                <tr key={m.id} className="border-b border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-900">{m.displayName || m.name}</td>
                  {roles.map((r) => {
                    const key = `${r.id}-${m.id}`;
                    return (
                      <td key={r.id} className="px-4 py-2">
                        <select
                          value={getAction(r.id, m.id)}
                          onChange={(e) => setAction(r.id, m.id, e.target.value)}
                          disabled={saving === key}
                          className="text-xs border border-gray-300 rounded px-2 py-1 disabled:opacity-50"
                        >
                          {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={!!addOpen}
        onClose={() => setAddOpen(null)}
        title={`Add ${addOpen === "role" ? "Role" : "Module"}`}
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setAddOpen(null)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={submitAdd} className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800">Add</button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Internal Name (e.g. payroll_management)</label>
            <input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Display Name</label>
            <input value={addForm.displayName} onChange={(e) => setAddForm((f) => ({ ...f, displayName: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
        </div>
      </Modal>
    </PageTemplate>
  );
}
