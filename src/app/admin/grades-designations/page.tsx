"use client";

import { useEffect, useState, useCallback } from "react";
import { Layers, Plus } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

interface Grade { id: number; name: string; description: string | null; }
interface Designation { id: number; name: string; departmentId: number | null; gradeId: number | null; }

export default function AdminGradesDesignationsPage() {
  const toast = useToast();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [loading, setLoading] = useState(true);

  const [gradeOpen, setGradeOpen] = useState(false);
  const [gradeForm, setGradeForm] = useState({ name: "", description: "" });
  const [desigOpen, setDesigOpen] = useState(false);
  const [desigForm, setDesigForm] = useState({ name: "", gradeId: "" });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [gRes, dRes] = await Promise.all([fetch("/api/admin/grades"), fetch("/api/employer/designations")]);
      const gJson = await gRes.json();
      const dJson = await dRes.json();
      if (!gRes.ok || !gJson.success) throw new Error(gJson.error);
      setGrades(gJson.data.grades);
      if (dRes.ok && dJson.success) setDesignations(dJson.data.designations);
    } catch (err) {
      toast.error("Failed to load", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function submitGrade() {
    if (!gradeForm.name.trim()) { toast.warning("Grade name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/grades", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(gradeForm),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Grade added");
      setGradeOpen(false);
      setGradeForm({ name: "", description: "" });
      fetchData();
    } catch (err) {
      toast.error("Failed to add grade", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function submitDesignation() {
    if (!desigForm.name.trim()) { toast.warning("Designation name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/employer/designations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: desigForm.name, gradeId: desigForm.gradeId ? Number(desigForm.gradeId) : null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Designation added");
      setDesigOpen(false);
      setDesigForm({ name: "", gradeId: "" });
      fetchData();
    } catch (err) {
      toast.error("Failed to add designation", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageTemplate title="Grades & Designations" subtitle="Shared master list used across every Employer" icon={Layers}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Grades</h3>
            <button onClick={() => setGradeOpen(true)} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
              <Plus className="w-3.5 h-3.5" /> Add Grade
            </button>
          </div>
          <DataTable<Grade>
            columns={[
              { key: "name", header: "Grade" },
              { key: "description", header: "Description", render: (r) => r.description || "-" },
            ]}
            data={grades}
            loading={loading}
            emptyMessage="No grades yet"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Designations</h3>
            <button onClick={() => setDesigOpen(true)} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
              <Plus className="w-3.5 h-3.5" /> Add Designation
            </button>
          </div>
          <DataTable<Designation>
            columns={[
              { key: "name", header: "Designation" },
              { key: "gradeId", header: "Grade", render: (r) => grades.find((g) => g.id === r.gradeId)?.name || "-" },
            ]}
            data={designations}
            loading={loading}
            emptyMessage="No designations yet"
          />
        </div>
      </div>

      <Modal
        isOpen={gradeOpen}
        onClose={() => setGradeOpen(false)}
        title="Add Grade"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setGradeOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={submitGrade} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Saving..." : "Add"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Grade Name</label>
            <input value={gradeForm.name} onChange={(e) => setGradeForm((f) => ({ ...f, name: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" placeholder="e.g. QAD Grade I" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea value={gradeForm.description} onChange={(e) => setGradeForm((f) => ({ ...f, description: e.target.value }))} rows={2} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={desigOpen}
        onClose={() => setDesigOpen(false)}
        title="Add Designation"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setDesigOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={submitDesignation} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Saving..." : "Add"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Designation Name</label>
            <input value={desigForm.name} onChange={(e) => setDesigForm((f) => ({ ...f, name: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" placeholder="e.g. Material Handler" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Grade</label>
            <select value={desigForm.gradeId} onChange={(e) => setDesigForm((f) => ({ ...f, gradeId: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
              <option value="">None</option>
              {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        </div>
      </Modal>
    </PageTemplate>
  );
}
