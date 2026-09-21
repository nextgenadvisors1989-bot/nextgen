"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Shield,
  LayoutDashboard,
  Users,
  Building2,
  UserCheck,
  FileText,
  ClipboardCheck,
  Key,
  Settings,
  Bell,
  BarChart3,
  Calendar,
  MapPin,
  Layers,
  ActivitySquare,
  Scale,
  BadgeCheck,
  Inbox,
  ChevronDown,
  ChevronRight,
  LogOut,
  Receipt,
  GraduationCap,
  ClipboardList,
  UserCog,
  Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Registrations", href: "/admin/registrations", icon: ClipboardList },
  { label: "Auditors", href: "/admin/auditors", icon: BadgeCheck },
  { label: "Employers", href: "/admin/employers", icon: Building2 },
  { label: "Employees", href: "/admin/employees", icon: Users },
  { label: "Documents", href: "/admin/documents", icon: FileText },
  { label: "Audit Types", href: "/admin/audit-types", icon: ClipboardCheck },
  { label: "Audit Inbox", href: "/admin/audit-inbox", icon: Inbox },
  { label: "Audit Assignments", href: "/admin/audit-assignments", icon: UserCheck },
  { label: "Credentials", href: "/admin/credentials", icon: Key },
  { label: "Compliance Calendar", href: "/admin/compliance-calendar", icon: Calendar },
  { label: "Legal Master", href: "/admin/legal-master", icon: Scale },
  { label: "Locations", href: "/admin/locations", icon: MapPin },
  { label: "Grades & Designations", href: "/admin/grades-designations", icon: Layers },
  { label: "Reports", href: "/admin/reports", icon: BarChart3 },
  { label: "Quotations & Billing", href: "/admin/quotations", icon: Receipt },
  { label: "RBAC", href: "/admin/rbac", icon: UserCog },
  { label: "Notifications", href: "/admin/notifications", icon: Bell },
  { label: "Audit Log", href: "/admin/audit-log", icon: ActivitySquare },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <aside className="w-64 flex-shrink-0 bg-slate-900 text-white flex flex-col h-screen sticky top-0">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-green-600 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-white tracking-wider uppercase">Admin Control</p>
            <p className="text-[10px] text-slate-400">Governance & Compliance</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {nav.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-0.5",
                active
                  ? "bg-green-600/20 text-green-400 border border-green-600/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-slate-700">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition w-full"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
