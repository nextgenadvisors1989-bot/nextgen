"use client";

import { useEffect, useState, useCallback } from "react";
import { CalendarCheck, AlertCircle } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate, formatDateTime, getMonthName } from "@/lib/utils";

interface AttendanceRow {
  id: number;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  hoursWorked: string | null;
  overtimeHours: string | null;
  isLateArrival: boolean | null;
  isEarlyDeparture: boolean | null;
  status: string;
}

const now = new Date();

export default function EmployeeAttendancePage() {
  const toast = useToast();
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(true);

  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState<AttendanceRow | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), month: String(month), year: String(year) });
      const res = await fetch(`/api/employee/attendance?${params}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setRows(json.data.attendance);
      setTotal(json.data.total);
    } catch (err) {
      toast.error("Failed to load attendance", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, month, year]);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  function openCorrection(row: AttendanceRow) {
    setActiveRecord(row);
    setReason("");
    setCorrectionOpen(true);
  }

  async function submitCorrection() {
    if (!activeRecord || !reason.trim()) {
      toast.warning("Reason required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/employee/attendance/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendanceId: activeRecord.id, reason }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Correction request submitted");
      setCorrectionOpen(false);
    } catch (err) {
      toast.error("Failed to submit", err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageTemplate title="Attendance" subtitle="Your daily attendance history" icon={CalendarCheck}>
      <div className="flex items-center gap-3 mb-4">
        <select value={month} onChange={(e) => { setMonth(Number(e.target.value)); setPage(1); }} className="text-sm border border-gray-300 rounded-lg px-3 py-2">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>{getMonthName(m)}</option>
          ))}
        </select>
        <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setPage(1); }} className="text-sm border border-gray-300 rounded-lg px-3 py-2">
          {[now.getFullYear(), now.getFullYear() - 1].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <DataTable<AttendanceRow>
        columns={[
          { key: "date", header: "Date", render: (r) => formatDate(r.date) },
          { key: "clockIn", header: "Clock In", render: (r) => r.clockIn ? formatDateTime(r.clockIn).split(",")[1] : "-" },
          { key: "clockOut", header: "Clock Out", render: (r) => r.clockOut ? formatDateTime(r.clockOut).split(",")[1] : "-" },
          { key: "hoursWorked", header: "Worked Hrs", render: (r) => r.hoursWorked || "-" },
          { key: "overtimeHours", header: "OT Hrs", render: (r) => r.overtimeHours || "-" },
          { key: "flags", header: "Flags", render: (r) => (
            <div className="flex gap-1">
              {r.isLateArrival && <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">Late</span>}
              {r.isEarlyDeparture && <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">Early Out</span>}
            </div>
          ) },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "actions", header: "", render: (r) => (
            <button onClick={() => openCorrection(r)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Raise Correction
            </button>
          ) },
        ]}
        data={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        loading={loading}
        emptyMessage="No attendance records for this month"
      />

      <Modal
        isOpen={correctionOpen}
        onClose={() => setCorrectionOpen(false)}
        title={`Raise Correction — ${activeRecord ? formatDate(activeRecord.date) : ""}`}
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setCorrectionOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={submitCorrection} disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        }
      >
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Reason (missing clock-in/out, wrong attendance, biometric issue, etc.)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Explain what needs correcting..."
        />
      </Modal>
    </PageTemplate>
  );
}
