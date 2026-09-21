"use client";

import { useEffect, useState, useCallback } from "react";
import { CalendarCheck, Check, X } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, formatDate } from "@/lib/utils";

interface AttRow {
  id: number;
  employeeId: number;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  hoursWorked: string | null;
  overtimeHours: string | null;
  status: string;
  isLateArrival: boolean | null;
  isEarlyDeparture: boolean | null;
  firstName: string;
  lastName: string | null;
  employeeNumber: string | null;
}

interface CorrectionRow {
  id: number;
  employeeId: number;
  requestedClockIn: string | null;
  requestedClockOut: string | null;
  reason: string;
  createdAt: string;
  firstName: string;
  lastName: string | null;
}

export default function EmployerAttendancePage() {
  const toast = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<AttRow[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/employer/attendance?date=${date}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.attendance);
      setCorrections(json.data.corrections);
    } catch (err) {
      toast.error("Failed to load attendance", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function reviewCorrection(id: number, action: "approve" | "reject") {
    setActingId(id);
    try {
      const res = await fetch(`/api/employer/attendance/corrections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success(`Correction ${action}d`);
      fetchData();
    } catch (err) {
      toast.error("Failed to process", err instanceof Error ? err.message : undefined);
    } finally {
      setActingId(null);
    }
  }

  const present = rows.filter((r) => r.status === "present").length;

  return (
    <PageTemplate title="Attendance" subtitle="Company-wide daily attendance" icon={CalendarCheck}>
      {corrections.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-5">
          <h3 className="text-sm font-semibold text-orange-900 mb-3">{corrections.length} Pending Correction Request{corrections.length > 1 ? "s" : ""}</h3>
          <div className="space-y-2">
            {corrections.map((c) => (
              <div key={c.id} className="bg-white rounded-lg p-3 flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{c.firstName} {c.lastName}</p>
                  <p className="text-xs text-gray-500">{c.reason}</p>
                  <p className="text-xs text-gray-400">
                    Requested: {c.requestedClockIn ? formatDateTime(c.requestedClockIn) : "-"} → {c.requestedClockOut ? formatDateTime(c.requestedClockOut) : "-"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => reviewCorrection(c.id, "approve")} disabled={actingId === c.id} className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                    <Check className="w-3 h-3" /> Approve
                  </button>
                  <button onClick={() => reviewCorrection(c.id, "reject")} disabled={actingId === c.id} className="flex items-center gap-1 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
                    <X className="w-3 h-3" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-2" />
        <span className="text-xs text-gray-500">{formatDate(date)} — {present} present of {rows.length} recorded</span>
      </div>

      <DataTable<AttRow>
        columns={[
          { key: "employee", header: "Employee", render: (r) => `${r.firstName} ${r.lastName || ""} (${r.employeeNumber || "-"})` },
          { key: "clockIn", header: "Clock In", render: (r) => r.clockIn ? formatDateTime(r.clockIn).split(",")[1] : "-" },
          { key: "clockOut", header: "Clock Out", render: (r) => r.clockOut ? formatDateTime(r.clockOut).split(",")[1] : "-" },
          { key: "hoursWorked", header: "Hours", render: (r) => r.hoursWorked || "-" },
          { key: "overtimeHours", header: "OT", render: (r) => r.overtimeHours || "-" },
          { key: "flags", header: "Flags", render: (r) => (
            <div className="flex gap-1">
              {r.isLateArrival && <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">Late</span>}
              {r.isEarlyDeparture && <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">Early Out</span>}
            </div>
          ) },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No attendance recorded for this date"
      />
    </PageTemplate>
  );
}
