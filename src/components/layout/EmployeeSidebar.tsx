"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  UserRound, LayoutDashboard, User, FileText, Clock, Calendar,
  DollarSign, BarChart3, Bell, HelpCircle, LogOut, ClipboardList,
  CreditCard, Gift, Minus, GraduationCap, Shield, Key, FileCheck, UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { label: "Dashboard", href: "/employee/dashboard", icon: LayoutDashboard },
  { label: "My Profile", href: "/employee/profile", icon: User },
  { label: "My Documents", href: "/employee/documents", icon: FileText },
  { label: "Clock In & Out", href: "/employee/clock", icon: Clock },
  { label: "Attendance", href: "/employee/attendance", icon: Calendar },
  { label: "My Wage", href: "/employee/wage", icon: DollarSign },
  { label: "Salary Slips", href: "/employee/salary-slips", icon: CreditCard },
  { label: "Deductions", href: "/employee/deductions", icon: Minus },
  { label: "Benefits", href: "/employee/benefits", icon: Gift },
  { label: "Leave Management", href: "/employee/leave", icon: ClipboardList },
  { label: "Permission Requests", href: "/employee/permissions", icon: UserCheck },
  { label: "Training & Induction", href: "/employee/training", icon: GraduationCap },
  { label: "Health & Safety", href: "/employee/health-safety", icon: Shield },
  { label: "My Credentials", href: "/employee/credentials", icon: Key },
  { label: "F&F Settlement", href: "/employee/fnf-settlement", icon: FileCheck },
  { label: "Notifications", href: "/employee/notifications", icon: Bell },
  { label: "Help & Support", href: "/employee/help", icon: HelpCircle },
];

export function EmployeeSidebar() {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <aside className="w-64 flex-shrink-0 bg-slate-800 text-white flex flex-col h-screen sticky top-0">
      <div className="px-5 py-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0">
            <UserRound className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-white tracking-wider uppercase">Employee</p>
            <p className="text-[10px] text-slate-400">Personal HR & Employment</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {nav.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || (href !== "/employee/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-0.5",
                active
                  ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
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
