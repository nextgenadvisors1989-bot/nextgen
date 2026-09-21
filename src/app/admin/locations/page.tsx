"use client";

import { useEffect, useState, useCallback } from "react";
import { MapPin, Plus } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

interface Location { id: number; state: string; district: string | null; city: string | null; pincode: string | null; }

export default function AdminLocationsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ state: "", district: "", city: "", pincode: "" });
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/locations");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.locations);
    } catch (err) {
      toast.error("Failed to load locations", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function submit() {
    if (!form.state.trim()) { toast.warning("State is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/locations", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Location added");
      setOpen(false);
      setForm({ state: "", district: "", city: "", pincode: "" });
      fetchRows();
    } catch (err) {
      toast.error("Failed to add location", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageTemplate title="Locations" subtitle="Master list of states, districts and sites" icon={MapPin}>
      <div className="flex justify-end mb-3">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition">
          <Plus className="w-3.5 h-3.5" /> Add Location
        </button>
      </div>

      <DataTable<Location>
        columns={[
          { key: "state", header: "State" },
          { key: "district", header: "District", render: (r) => r.district || "-" },
          { key: "city", header: "City", render: (r) => r.city || "-" },
          { key: "pincode", header: "Pincode", render: (r) => r.pincode || "-" },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No locations added yet"
      />

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Add Location"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Saving..." : "Add"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
            <input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">District</label>
            <input value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
              <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Pincode</label>
              <input value={form.pincode} onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
          </div>
        </div>
      </Modal>
    </PageTemplate>
  );
}
