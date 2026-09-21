"use client";

import { useEffect, useState, useCallback } from "react";
import { Receipt, Download, Mail } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, getMonthName } from "@/lib/utils";

interface SlipRow {
  id: number; month: number; year: number; pdfUrl: string | null; generatedAt: string;
  netWage: string | null; bankPaymentStatus: string | null;
  firstName: string; lastName: string | null; employeeNumber: string | null; email: string | null;
}

const now = new Date();

export default function EmployerSalarySlipsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<SlipRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), month: String(month), year: String(year) });
      const res = await fetch(`/api/employer/salary-slips?${params}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.slips);
      setTotal(json.data.total);
    } catch (err) {
      toast.error("Failed to load salary slips", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, month, year]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return (
    <PageTemplate title="Salary Slips" subtitle="Distribute and track generated salary slips" icon={Receipt}>
      <div className="flex items-center gap-3 mb-4">
        <select value={month} onChange={(e) => { setMonth(Number(e.target.value)); setPage(1); }} className="text-sm border border-gray-300 rounded-lg px-3 py-2">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{getMonthName(m)}</option>)}
        </select>
        <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setPage(1); }} className="text-sm border border-gray-300 rounded-lg px-3 py-2">
          {[now.getFullYear(), now.getFullYear() - 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <DataTable<SlipRow>
        columns={[
          { key: "employee", header: "Employee", render: (r) => `${r.firstName} ${r.lastName || ""} (${r.employeeNumber || "-"})` },
          { key: "netWage", header: "Net Wage", render: (r) => formatCurrency(r.netWage) },
          { key: "bankPaymentStatus", header: "Payment", render: (r) => <StatusBadge status={r.bankPaymentStatus || "pending"} /> },
          { key: "actions", header: "Actions", render: (r) => (
            <div className="flex items-center gap-3">
              {r.pdfUrl ? (
                <a href={r.pdfUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                  <Download className="w-3 h-3" /> Download
                </a>
              ) : <span className="text-xs text-gray-400">No PDF</span>}
              {r.email && (
                <a href={`mailto:${r.email}`} className="flex items-center gap-1 text-xs text-gray-600 hover:underline">
                  <Mail className="w-3 h-3" /> Email
                </a>
              )}
            </div>
          ) },
        ]}
        data={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        loading={loading}
        emptyMessage="No salary slips for this period yet — finalize a payroll run to generate them"
      />
    </PageTemplate>
  );
}
