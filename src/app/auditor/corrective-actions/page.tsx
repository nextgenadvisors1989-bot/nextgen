"use client";

import { useEffect, useState, useCallback } from "react";
import { ClipboardCheck, Check, RotateCcw } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface CA {
  id: number; findingId: number; auditId: number; description: string; assignedTo: string | null;
  dueDate: string | null; status: string | null; evidenceUrl: string | null;
  companyName: string; auditNumber: string | null; findingDescription: string;
}

export default function AuditorCorrectiveActionsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<CA[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auditor/corrective-actions");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.correctiveActions);
    } catch (err) {
      toast.error("Failed to load corrective actions", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function review(id: number, action: "accept" | "reopen") {
    setActingId(id);
    try {
      const res = await fetch(`/api/auditor/corrective-actions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success(action === "accept" ? "Closed" : "Reopened");
      fetchRows();
    } catch (err) {
      toast.error("Failed to update", err instanceof Error ? err.message : undefined);
    } finally {
      setActingId(null);
    }
  }

  return (
    <PageTemplate title="Corrective Actions" subtitle="Review employer-submitted closure evidence" icon={ClipboardCheck}>
      <DataTable<CA>
        columns={[
          { key: "companyName", header: "Company" },
          { key: "description", header: "Corrective Action" },
          { key: "assignedTo", header: "Assigned To", render: (r) => r.assignedTo || "-" },
          { key: "dueDate", header: "Due Date", render: (r) => formatDate(r.dueDate) },
          { key: "evidenceUrl", header: "Evidence", render: (r) => r.evidenceUrl ? (
            <a href={r.evidenceUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">View</a>
          ) : <span className="text-xs text-gray-400">Not submitted</span> },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status || "open"} /> },
          { key: "actions", header: "Actions", render: (r) => r.status === "evidence_submitted" ? (
            <div className="flex items-center gap-2">
              <button onClick={() => review(r.id, "accept")} disabled={actingId === r.id} className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                <Check className="w-3 h-3" /> Accept & Close
              </button>
              <button onClick={() => review(r.id, "reopen")} disabled={actingId === r.id} className="flex items-center gap-1 px-2 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50">
                <RotateCcw className="w-3 h-3" /> Reopen
              </button>
            </div>
          ) : r.status === "closed" ? (
            <span className="text-xs text-gray-400">Closed</span>
          ) : (
            <span className="text-xs text-gray-400">Awaiting employer</span>
          ) },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No corrective actions raised yet"
      />
    </PageTemplate>
  );
}
