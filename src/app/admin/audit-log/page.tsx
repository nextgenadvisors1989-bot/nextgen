"use client";

import { useEffect, useState, useCallback } from "react";
import { History } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/utils";

interface LogRow {
  id: number; action: string; entityType: string | null; entityId: number | null;
  newData: unknown; createdAt: string; userEmail: string | null; userRole: string | null;
}

const ENTITY_TYPES = ["registration", "employee", "employer", "auditor", "document_upload", "credential", "audit"];

export default function AdminAuditLogPage() {
  const toast = useToast();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [entityType, setEntityType] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (entityType) params.set("entityType", entityType);
      const res = await fetch(`/api/admin/audit-log?${params}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.logs);
      setTotal(json.data.total);
    } catch (err) {
      toast.error("Failed to load audit log", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, entityType]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return (
    <PageTemplate title="Audit Log" subtitle="System activity trail of admin actions" icon={History}>
      <div className="flex items-center gap-3 mb-4">
        <select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} className="text-sm border border-gray-300 rounded-lg px-3 py-2">
          <option value="">All Entities</option>
          {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      <DataTable<LogRow>
        columns={[
          { key: "action", header: "Action", render: (r) => <span className="font-mono text-xs">{r.action}</span> },
          { key: "entityType", header: "Entity", render: (r) => r.entityType ? <span className="capitalize">{r.entityType.replace(/_/g, " ")} {r.entityId ? `#${r.entityId}` : ""}</span> : "-" },
          { key: "userEmail", header: "Performed By", render: (r) => r.userEmail ? <span>{r.userEmail} <span className="text-xs text-gray-400 capitalize">({r.userRole?.replace(/_/g, " ")})</span></span> : "System" },
          { key: "newData", header: "Details", render: (r) => r.newData ? <span className="text-xs text-gray-500 font-mono">{JSON.stringify(r.newData).slice(0, 80)}</span> : "-" },
          { key: "createdAt", header: "When", render: (r) => formatDateTime(r.createdAt) },
        ]}
        data={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        loading={loading}
        emptyMessage="No activity recorded yet — this fills in as Admin actions are performed"
      />
    </PageTemplate>
  );
}
