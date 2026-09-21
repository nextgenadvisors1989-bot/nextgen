"use client";

import { useEffect, useState, useCallback } from "react";
import { GraduationCap, CheckCircle2, FileText } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface TrainingRow {
  id: number;
  title: string;
  description: string | null;
  trainedBy: string | null;
  trainingDate: string | null;
  expiryDate: string | null;
  status: string;
  certificateUrl: string | null;
}

export default function EmployeeTrainingPage() {
  const toast = useToast();
  const [rows, setRows] = useState<TrainingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ackingId, setAckingId] = useState<number | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/employee/training");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.trainings);
    } catch (err) {
      toast.error("Failed to load training records", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function acknowledge(id: number) {
    setAckingId(id);
    try {
      const res = await fetch(`/api/employee/training/${id}/acknowledge`, { method: "PATCH" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Training acknowledged as completed");
      fetchRows();
    } catch (err) {
      toast.error("Failed to acknowledge", err instanceof Error ? err.message : undefined);
    } finally {
      setAckingId(null);
    }
  }

  return (
    <PageTemplate title="Training & Induction" subtitle="Assigned trainings, due dates and certificates" icon={GraduationCap}>
      <DataTable<TrainingRow>
        columns={[
          { key: "title", header: "Training" },
          { key: "trainedBy", header: "Trained By", render: (r) => r.trainedBy || "-" },
          { key: "trainingDate", header: "Date", render: (r) => formatDate(r.trainingDate) },
          { key: "expiryDate", header: "Expiry / Refresher Due", render: (r) => formatDate(r.expiryDate) },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "actions", header: "", render: (r) => (
            <div className="flex items-center gap-3">
              {r.certificateUrl && (
                <a href={r.certificateUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                  <FileText className="w-3 h-3" /> Certificate
                </a>
              )}
              {r.status !== "completed" && (
                <button
                  onClick={() => acknowledge(r.id)}
                  disabled={ackingId === r.id}
                  className="flex items-center gap-1 text-xs text-green-700 hover:underline disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3 h-3" /> {ackingId === r.id ? "Saving..." : "Mark Completed"}
                </button>
              )}
            </div>
          ) },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No training assigned yet"
      />
    </PageTemplate>
  );
}
