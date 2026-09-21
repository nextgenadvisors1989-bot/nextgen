"use client";

import { useEffect, useState } from "react";
import { Building2, Users, Clock, Calendar, DollarSign, BadgeCheck, AlertCircle, CheckCircle2 } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import Link from "next/link";

interface DashboardData {
  stats: {
    totalEmployees: number;
    activeEmployees: number;
    pendingLeave: number;
    pendingPermissions: number;
    openPayrolls: number;
    activeAuditors: number;
  };
}

export default function EmployerDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchData() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/employer/dashboard");
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      setData(json.data);
    } catch {
      setError("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  if (loading) return <LoadingState message="Loading dashboard..." />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;
  if (!data) return null;

  const { stats } = data;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center">
          <Building2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Employer Dashboard</h1>
          <p className="text-sm text-gray-500">Workforce, Payroll and Compliance Overview</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard title="Total Employees" value={stats.totalEmployees} icon={Users} color="purple" subtitle={`${stats.activeEmployees} active`} />
        <StatCard title="Pending Leave" value={stats.pendingLeave} icon={Calendar} color="orange" />
        <StatCard title="Pending Permissions" value={stats.pendingPermissions} icon={Clock} color="blue" />
        <StatCard title="Open Payrolls" value={stats.openPayrolls} icon={DollarSign} color="green" />
        <StatCard title="Active Auditors" value={stats.activeAuditors} icon={BadgeCheck} color="teal" />
        <StatCard title="Compliance Status" value="Active" icon={CheckCircle2} color="green" />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">HR Actions</h3>
          <div className="space-y-2">
            {[
              { label: "Add Employee", href: "/employer/employees/new", color: "bg-purple-600" },
              { label: "Mark Attendance", href: "/employer/attendance", color: "bg-blue-700" },
              { label: "Process Leave", href: "/employer/leave", color: "bg-orange-600" },
              { label: "Run Payroll", href: "/employer/payroll", color: "bg-green-600" },
            ].map(({ label, href, color }) => (
              <Link key={href} href={href} className={`flex items-center gap-2 px-3 py-2 ${color} text-white rounded-lg text-sm font-medium hover:opacity-90 transition`}>
                {label}
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Compliance</h3>
          <div className="space-y-2">
            {[
              { label: "View Compliance Register", href: "/employer/compliance", color: "bg-teal-600" },
              { label: "Audit Reports", href: "/employer/audit-reports", color: "bg-slate-700" },
              { label: "Documents", href: "/employer/documents", color: "bg-gray-600" },
              { label: "Auditor Assignments", href: "/employer/auditor-assignment", color: "bg-indigo-600" },
            ].map(({ label, href, color }) => (
              <Link key={href} href={href} className={`flex items-center gap-2 px-3 py-2 ${color} text-white rounded-lg text-sm font-medium hover:opacity-90 transition`}>
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Employee List", href: "/employer/employees", icon: Users, color: "border-purple-200 hover:bg-purple-50" },
          { label: "Attendance", href: "/employer/attendance", icon: Clock, color: "border-blue-200 hover:bg-blue-50" },
          { label: "Leave Management", href: "/employer/leave", icon: Calendar, color: "border-orange-200 hover:bg-orange-50" },
          { label: "Payroll", href: "/employer/payroll", icon: DollarSign, color: "border-green-200 hover:bg-green-50" },
          { label: "Salary Slips", href: "/employer/salary-slips", icon: CheckCircle2, color: "border-teal-200 hover:bg-teal-50" },
          { label: "Wage Config", href: "/employer/wage-config", icon: DollarSign, color: "border-indigo-200 hover:bg-indigo-50" },
          { label: "Departments", href: "/employer/departments", icon: Building2, color: "border-gray-200 hover:bg-gray-50" },
          { label: "Reports", href: "/employer/reports", icon: AlertCircle, color: "border-red-200 hover:bg-red-50" },
        ].map(({ label, href, icon: Icon, color }) => (
          <Link key={href} href={href} className={`bg-white border rounded-xl p-4 flex items-center gap-3 transition text-sm font-medium text-gray-700 shadow-sm ${color}`}>
            <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
