"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Building2, Clock, FileCheck, AlertTriangle, CheckSquare, Plus } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import Link from "next/link";

interface DashboardData {
  stats: {
    assignedCompanies: number;
    pendingAudits: number;
    draftAudits: number;
    submittedAudits: number;
    openFindings: number;
    openCorrectiveActions: number;
  };
}

export default function AuditorDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchData() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auditor/dashboard");
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to fetch");
      }
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  if (loading) return <LoadingState message="Loading auditor dashboard..." />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;
  if (!data) return null;

  const { stats } = data;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center">
          <BadgeCheck className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Auditor Dashboard</h1>
          <p className="text-sm text-gray-500">Independent Audit and Assessment Overview</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard title="Assigned Companies" value={stats.assignedCompanies} icon={Building2} color="blue" />
        <StatCard title="Pending Audits" value={stats.pendingAudits} icon={Clock} color="orange" />
        <StatCard title="Draft Audits" value={stats.draftAudits} icon={FileCheck} color="purple" />
        <StatCard title="Submitted Audits" value={stats.submittedAudits} icon={CheckSquare} color="green" />
        <StatCard title="Open Findings" value={stats.openFindings} icon={AlertTriangle} color="red" />
        <StatCard title="Corrective Actions" value={stats.openCorrectiveActions} icon={BadgeCheck} color="teal" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h3>
          <div className="space-y-2">
            {[
              { label: "Start New Audit", href: "/auditor/audits/new", color: "bg-teal-600" },
              { label: "View Assigned Companies", href: "/auditor/companies", color: "bg-blue-700" },
              { label: "View My Audits", href: "/auditor/audits", color: "bg-purple-600" },
              { label: "View Findings", href: "/auditor/findings", color: "bg-red-600" },
            ].map(({ label, href, color }) => (
              <Link key={href} href={href} className={`flex items-center gap-2 px-3 py-2 ${color} text-white rounded-lg text-sm font-medium hover:opacity-90 transition`}>
                {label}
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Navigation</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "My Profile", href: "/auditor/profile" },
              { label: "Credentials", href: "/auditor/credentials" },
              { label: "Schedule", href: "/auditor/schedule" },
              { label: "Checklists", href: "/auditor/checklists" },
              { label: "Reports", href: "/auditor/reports" },
              { label: "Notifications", href: "/auditor/notifications" },
            ].map(({ label, href }) => (
              <Link key={href} href={href} className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition text-center">
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
