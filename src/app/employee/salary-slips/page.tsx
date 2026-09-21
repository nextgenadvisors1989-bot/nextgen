"use client";

import { useEffect, useState, useCallback } from "react";
import { Receipt, Download } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatDate, getMonthName } from "@/lib/utils";

interface SlipRow {
  id: number;
  month: number;
  year: number;
  pdfUrl: string | null;
  generatedAt: string;
  grossEarnings: string | null;
  totalDeductions: string | null;
  netWage: string | null;
  bankPaymentStatus: string | null;
}

export default function EmployeeSalarySlipsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<SlipRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);

  const fetchSlips = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/employee/salary-slips?page=${page}&pageSize=${pageSize}`);
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
  }, [page, pageSize]);

  useEffect(() => { fetchSlips(); }, [fetchSlips]);

  return (
    <PageTemplate title="Salary Slips" subtitle="Your monthly salary slip history" icon={Receipt}>
      <DataTable<SlipRow>
        columns={[
          { key: "period", header: "Period", render: (r) => `${getMonthName(r.month)} ${r.year}` },
          { key: "grossEarnings", header: "Gross Earnings", render: (r) => formatCurrency(r.grossEarnings) },
          { key: "totalDeductions", header: "Deductions", render: (r) => formatCurrency(r.totalDeductions) },
          { key: "netWage", header: "Net Wage", render: (r) => <span className="font-semibold text-gray-900">{formatCurrency(r.netWage)}</span> },
          { key: "bankPaymentStatus", header: "Payment Status", render: (r) => <StatusBadge status={r.bankPaymentStatus || "pending"} /> },
          { key: "generatedAt", header: "Generated", render: (r) => formatDate(r.generatedAt) },
          { key: "actions", header: "", render: (r) => r.pdfUrl ? (
            <a href={r.pdfUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
              <Download className="w-3 h-3" /> Download
            </a>
          ) : <span className="text-xs text-gray-400">Not generated</span> },
        ]}
        data={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        loading={loading}
        emptyMessage="No salary slips generated yet"
      />
    </PageTemplate>
  );
}
