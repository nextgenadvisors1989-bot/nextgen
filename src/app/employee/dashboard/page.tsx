"use client";

import { useEffect, useState } from "react";
import { UserRound, Calendar, DollarSign, Clock, Bell, FileText } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";

interface EmployeeProfile {
  firstName: string;
  lastName: string | null;
  employeeNumber: string | null;
  companyName: string | null;
  deptName: string | null;
  desigName: string | null;
  joiningDate: string | null;
  employeeType: string;
  status: string;
}

export default function EmployeeDashboardPage() {
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchProfile() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/employee/profile");
      if (!res.ok) throw new Error("Failed to load profile");
      const json = await res.json();
      setProfile(json.data.employee);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchProfile(); }, []);

  if (loading) return <LoadingState message="Loading your dashboard..." />;
  if (error) return <ErrorState message={error} onRetry={fetchProfile} />;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center">
          <UserRound className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Welcome, {profile?.firstName} {profile?.lastName}
          </h1>
          <p className="text-sm text-gray-500">
            {profile?.employeeNumber} | {profile?.companyName} | {profile?.deptName || "No Department"}
          </p>
        </div>
      </div>

      {/* Profile Summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">My Information</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500">Employee No.</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">{profile?.employeeNumber || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Designation</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">{profile?.desigName || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Joining Date</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">{formatDate(profile?.joiningDate)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Employee Type</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5 capitalize">{profile?.employeeType || "-"}</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Clock In / Out", href: "/employee/clock", icon: Clock, color: "bg-orange-500" },
          { label: "Apply Leave", href: "/employee/leave", icon: Calendar, color: "bg-blue-600" },
          { label: "View Salary Slip", href: "/employee/salary-slips", icon: DollarSign, color: "bg-green-600" },
          { label: "My Attendance", href: "/employee/attendance", icon: Calendar, color: "bg-purple-600" },
        ].map(({ label, href, icon: Icon, color }) => (
          <Link key={href} href={href} className={`flex flex-col items-center gap-2 p-4 ${color} text-white rounded-xl hover:opacity-90 transition text-center`}>
            <Icon className="w-5 h-5" />
            <span className="text-xs font-medium">{label}</span>
          </Link>
        ))}
      </div>

      {/* Navigation Links */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "My Profile", href: "/employee/profile", icon: UserRound, desc: "View and edit personal info" },
          { label: "My Documents", href: "/employee/documents", icon: FileText, desc: "View uploaded documents" },
          { label: "Leave Balance", href: "/employee/leave", icon: Calendar, desc: "Check leave balance" },
          { label: "My Wage", href: "/employee/wage", icon: DollarSign, desc: "View wage breakdown" },
          { label: "Salary Slips", href: "/employee/salary-slips", icon: DollarSign, desc: "Download salary slips" },
          { label: "Notifications", href: "/employee/notifications", icon: Bell, desc: "View all notifications" },
        ].map(({ label, href, icon: Icon, desc }) => (
          <Link key={href} href={href} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3 hover:bg-gray-50 transition shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
