"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock, LogIn, LogOut, CheckCircle2 } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";

interface AttendanceToday {
  id: number;
  clockIn: string | null;
  clockOut: string | null;
  hoursWorked: string | null;
  overtimeHours: string | null;
  status: string;
}

function fmtTime(d: string | null) {
  if (!d) return "--:--";
  return new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function EmployeeClockPage() {
  const toast = useToast();
  const [today, setToday] = useState<AttendanceToday | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);
  const [now, setNow] = useState(new Date());

  const fetchToday = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/employee/clock");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load attendance");
      setToday(json.data.today);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchToday(); }, [fetchToday]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  async function act(action: "clock_in" | "clock_out") {
    setActing(true);
    try {
      const res = await fetch("/api/employee/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, method: "manual" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Action failed");
      setToday(json.data.attendance);
      toast.success(action === "clock_in" ? "Clocked in" : "Clocked out");
    } catch (err) {
      toast.error("Action failed", err instanceof Error ? err.message : undefined);
    } finally {
      setActing(false);
    }
  }

  if (loading) return <LoadingState message="Loading..." />;
  if (error) return <ErrorState message={error} onRetry={fetchToday} />;

  const hasClockedIn = !!today?.clockIn;
  const hasClockedOut = !!today?.clockOut;

  return (
    <PageTemplate title="Clock In / Out" subtitle="Record your attendance for today" icon={Clock}>
      <div className="max-w-md mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
          {now.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
        </p>
        <p className="text-4xl font-bold text-gray-900 mb-6 tabular-nums">
          {now.toLocaleTimeString("en-IN")}
        </p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500">Clock In</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">{fmtTime(today?.clockIn ?? null)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500">Clock Out</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">{fmtTime(today?.clockOut ?? null)}</p>
          </div>
        </div>

        {hasClockedOut ? (
          <div className="flex flex-col items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-xl py-4">
            <CheckCircle2 className="w-6 h-6" />
            <p className="text-sm font-medium">Day complete — {today?.hoursWorked || "0"} hrs worked</p>
            {Number(today?.overtimeHours || 0) > 0 && (
              <p className="text-xs">Includes {today?.overtimeHours} hrs overtime</p>
            )}
          </div>
        ) : hasClockedIn ? (
          <button
            onClick={() => act("clock_out")}
            disabled={acting}
            className="w-full flex items-center justify-center gap-2 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" /> {acting ? "Recording..." : "Clock Out"}
          </button>
        ) : (
          <button
            onClick={() => act("clock_in")}
            disabled={acting}
            className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" /> {acting ? "Recording..." : "Clock In"}
          </button>
        )}

        <p className="text-xs text-gray-400 mt-4">
          Method: Manual (your Employer can enable biometric, webcam or geo-fence capture)
        </p>
      </div>
    </PageTemplate>
  );
}
