"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2, LayoutDashboard, Users, Briefcase, FileText, Clock, Calendar,
  DollarSign, BarChart3, Bell, Settings, LogOut, ChevronRight, UserPlus,
  ClipboardList, CreditCard, Gift, Minus, FileCheck, BadgeCheck, Shield,
  UserCheck, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { label: "Dashboard", href: "/employer/dashboard", icon: LayoutDashboard },
  { label: "Company Profile", href: "/employer/profile", icon: Building2 },
  { label: "Departments", href: "/employer/departments", icon: Layers },
  { label: "Employee Registration", href: "/employer/employees/new", icon: UserPlus },
  { label: "Employee List", href: "/employer/employees", icon: Users },
  { label: "Documents", href: "/employer/documents", icon: FileText },
  { label: "Attendance", href: "/employer/attendance", icon: Clock },
  { label: "Shifts", href: "/employer/shifts", icon: Calendar },
  { label: "Leave Management", href: "/employer/leave", icon: ClipboardList },
  { label: "Permission Requests", href: "/employer/permissions", icon: UserCheck },
  { label: "Wage Configuration", href: "/employer/wage-config", icon: DollarSign },
  { label: "Payroll Processing", href: "/employer/payroll", icon: CreditCard },
  { label: "Payroll Register", href: "/employer/payroll/register", icon: BarChart3 },
  { label: "Salary Slips", href: "/employer/salary-slips", icon: FileCheck },
  { label: "Benefits", href: "/employer/benefits", icon: Gift },
  { label: "Deductions", href: "/employer/deductions", icon: Minus },
  { label: "F&F Settlement", href: "/employer/fnf-settlement", icon: FileCheck },
  { label: "Auditor Assignment", href: "/employer/auditor-assignment", icon: BadgeCheck },
  { label: "Compliance Register", href: "/employer/compliance", icon: Shield },
  { label: "Audit Reports", href: "/employer/audit-reports", icon: ClipboardList },
  { label: "Reports", href: "/employer/reports", icon: BarChart3 },
  { label: "Notifications", href: "/employer/notifications", icon: Bell },
  { label: "Settings", href: "/employer/settings", icon: Settings },
];

export function EmployerSidebar() {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <aside className="w-64 flex-shrink-0 bg-slate-800 text-white flex flex-col h-screen sticky top-0">
      <div className="px-5 py-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-600 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-white tracking-wider uppercase">Employer</p>
            <p className="text-[10px] text-slate-400">Workforce & Compliance</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {nav.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || (href !== "/employer/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-0.5",
                active
                  ? "bg-purple-600/20 text-purple-400 border border-purple-600/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-700"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-2 py-3 border-t border-slate-700">
        <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-700 transition w-full">
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
