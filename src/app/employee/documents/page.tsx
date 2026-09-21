"use client";

import { useEffect, useState, useCallback } from "react";
import { FileText, Upload, AlertCircle } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface DocRow {
  id: number;
  documentType: string;
  fileName: string | null;
  fileUrl: string | null;
  status: string;
  rejectionReason: string | null;
  expiryDate: string | null;
  createdAt: string;
}

export default function EmployeeDocumentsPage() {
  const toast = useToast();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [pendingTypes, setPendingTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [form, setForm] = useState({ documentType: "", fileName: "", fileUrl: "" });
  const [saving, setSaving] = useState(false);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/employee/documents");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load documents");
      setDocs(json.data.documents);
      setPendingTypes(json.data.pendingTypes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  function openUpload(prefillType?: string) {
    setForm({ documentType: prefillType || "", fileName: "", fileUrl: "" });
    setUploadOpen(true);
  }

  async function submitUpload() {
    if (!form.documentType || !form.fileName || !form.fileUrl) {
      toast.warning("Missing details", "Document type, file name and file link are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/employee/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Upload failed");
      toast.success("Document uploaded", "It is now pending verification.");
      setUploadOpen(false);
      fetchDocs();
    } catch (err) {
      toast.error("Upload failed", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState message="Loading your documents..." />;
  if (error) return <ErrorState message={error} onRetry={fetchDocs} />;

  return (
    <PageTemplate title="My Documents" subtitle="Checklist, uploads and verification status" icon={FileText}>
      {pendingTypes.length > 0 && (
        <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-5">
          <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-900">
              {pendingTypes.length} document{pendingTypes.length > 1 ? "s" : ""} still pending
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {pendingTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => openUpload(t)}
                  className="text-xs px-2.5 py-1 bg-white border border-yellow-300 rounded-full text-yellow-800 hover:bg-yellow-100 transition"
                >
                  + {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end mb-3">
        <button
          onClick={() => openUpload()}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition"
        >
          <Upload className="w-3.5 h-3.5" /> Upload Document
        </button>
      </div>

      <DataTable<DocRow>
        columns={[
          { key: "documentType", header: "Document Type" },
          { key: "fileName", header: "File", render: (r) => r.fileUrl ? (
              <a href={r.fileUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{r.fileName}</a>
            ) : (r.fileName || "-") },
          { key: "status", header: "Status", render: (r) => (
            <div>
              <StatusBadge status={r.status} />
              {r.status === "rejected" && r.rejectionReason && (
                <p className="text-xs text-red-600 mt-1">{r.rejectionReason}</p>
              )}
            </div>
          ) },
          { key: "expiryDate", header: "Expiry", render: (r) => formatDate(r.expiryDate) },
          { key: "createdAt", header: "Uploaded", render: (r) => formatDate(r.createdAt) },
        ]}
        data={docs}
        emptyMessage="No documents uploaded yet"
      />

      <Modal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload Document"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setUploadOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={submitUpload} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Uploading..." : "Upload"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Document Type</label>
            <input
              value={form.documentType}
              onChange={(e) => setForm((f) => ({ ...f, documentType: e.target.value }))}
              placeholder="e.g. Identity Proof"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">File Name</label>
            <input
              value={form.fileName}
              onChange={(e) => setForm((f) => ({ ...f, fileName: e.target.value }))}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">File URL</label>
            <input
              value={form.fileUrl}
              onChange={(e) => setForm((f) => ({ ...f, fileUrl: e.target.value }))}
              placeholder="https://..."
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              File storage isn&apos;t wired to an object store yet — paste a link for now.
            </p>
          </div>
        </div>
      </Modal>
    </PageTemplate>
  );
}
