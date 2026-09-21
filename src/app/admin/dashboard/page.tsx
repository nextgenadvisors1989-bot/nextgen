"use client";

import { useEffect, useState } from "react";
import { Shield, Building2, Users, BadgeCheck, ClipboardCheck, Clock, AlertCircle, BarChart3, TrendingUp, UserCheck } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";

interface DashboardData {
  stats: {
    totalEmployers: number;
    totalEmployees: number;
    totalAuditors: number;
    totalAudits: number;
    pendingRegistrations: number;
    activeEmployers: number;
    pendingAudits: number;
    totalUsers: number;
  };
  recentAuditLog: Array<{
    id: number;
    action: string;
    entityType: string | null;
    createdAt: string;
  }>;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchData() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/dashboard");
      if (!res.ok) throw new Error("Failed to fetch");
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
      {/* Page Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Admin Control Center</h1>
          <p className="text-sm text-gray-500">Governance, Compliance and Operations Overview</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Employers" value={stats.totalEmployers} icon={Building2} color="blue" subtitle={`${stats.activeEmployers} active`} />
        <StatCard title="Total Employees" value={stats.totalEmployees} icon={Users} color="green" />
        <StatCard title="Auditors" value={stats.totalAuditors} icon={BadgeCheck} color="teal" />
        <StatCard title="Total Audits" value={stats.totalAudits} icon={ClipboardCheck} color="purple" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Pending Registrations" value={stats.pendingRegistrations} icon={Clock} color="orange" />
        <StatCard title="Pending Audits" value={stats.pendingAudits} icon={AlertCircle} color="red" />
        <StatCard title="Total Users" value={stats.totalUsers} icon={UserCheck} color="navy" />
        <StatCard title="Platform Health" value="Active" icon={TrendingUp} color="green" />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h3>
          <div className="space-y-2">
            {[
              { label: "Create Auditor", href: "/admin/auditors?action=create", color: "bg-teal-600" },
              { label: "Create Employer", href: "/admin/employers?action=create", color: "bg-blue-700" },
              { label: "View Registrations", href: "/admin/registrations", color: "bg-purple-600" },
              { label: "Audit Inbox", href: "/admin/audit-inbox", color: "bg-orange-600" },
            ].map(({ label, href, color }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 px-3 py-2 ${color} text-white rounded-lg text-sm font-medium hover:opacity-90 transition`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm md:col-span-2">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent System Activity</h3>
          {data.recentAuditLog.length === 0 ? (
            <p className="text-sm text-gray-400">No recent activity</p>
          ) : (
            <div className="space-y-2">
              {data.recentAuditLog.map((log) => (
                <div key={log.id} className="flex items-start justify-between text-sm border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium text-gray-700">{log.action}</p>
                    {log.entityType && <p className="text-xs text-gray-400">{log.entityType}</p>}
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{formatDateTime(log.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Manage Auditors", href: "/admin/auditors", icon: BadgeCheck, color: "border-teal-200 hover:bg-teal-50" },
          { label: "Manage Employers", href: "/admin/employers", icon: Building2, color: "border-blue-200 hover:bg-blue-50" },
          { label: "Manage Employees", href: "/admin/employees", icon: Users, color: "border-green-200 hover:bg-green-50" },
          { label: "Audit Types", href: "/admin/audit-types", icon: ClipboardCheck, color: "border-purple-200 hover:bg-purple-50" },
          { label: "Compliance Calendar", href: "/admin/compliance-calendar", icon: BarChart3, color: "border-orange-200 hover:bg-orange-50" },
          { label: "Legal Master", href: "/admin/legal-master", icon: BarChart3, color: "border-red-200 hover:bg-red-50" },
          { label: "System Audit Log", href: "/admin/audit-log", icon: BarChart3, color: "border-gray-200 hover:bg-gray-50" },
          { label: "RBAC Settings", href: "/admin/rbac", icon: UserCheck, color: "border-slate-200 hover:bg-slate-50" },
        ].map(({ label, href, icon: Icon, color }) => (
          <Link
            key={href}
            href={href}
            className={`bg-white border rounded-xl p-4 flex items-center gap-3 transition text-sm font-medium text-gray-700 shadow-sm ${color}`}
          >
            <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
