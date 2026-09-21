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
  Menu,
  X,
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
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-50 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white shadow-lg md:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>
      {mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/50 md:hidden"
          aria-label="Close navigation"
        />
      )}
      <aside className={cn("fixed inset-y-0 left-0 z-50 flex h-screen w-72 flex-shrink-0 -translate-x-full flex-col bg-slate-900 text-white shadow-2xl transition-transform duration-200 md:sticky md:top-0 md:w-64 md:translate-x-0 md:shadow-none", mobileOpen && "translate-x-0")}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-700">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-green-600 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-white tracking-wider uppercase">Admin Control</p>
            <p className="text-[10px] text-slate-400">Governance & Compliance</p>
          </div>
            </div>
            <button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white md:hidden" aria-label="Close navigation">
              <X className="h-5 w-5" />
            </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {nav.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              onClick={() => setMobileOpen(false)}
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
    </>
  );
}
