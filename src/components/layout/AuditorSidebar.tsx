"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardCheck, LayoutDashboard, User, Key, Building2, Calendar,
  ClipboardList, FileText, Upload, AlertTriangle, CheckSquare,
  BarChart3, Bell, HelpCircle, LogOut, BadgeCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { label: "Dashboard", href: "/auditor/dashboard", icon: LayoutDashboard },
  { label: "My Profile", href: "/auditor/profile", icon: User },
  { label: "My Credentials", href: "/auditor/credentials", icon: Key },
  { label: "Assigned Companies", href: "/auditor/companies", icon: Building2 },
  { label: "Audit Schedule", href: "/auditor/schedule", icon: Calendar },
  { label: "Checklist & Forms", href: "/auditor/checklists", icon: ClipboardList },
  { label: "My Audits", href: "/auditor/audits", icon: ClipboardCheck },
  { label: "Evidence Upload", href: "/auditor/evidence", icon: Upload },
  { label: "Findings", href: "/auditor/findings", icon: AlertTriangle },
  { label: "Corrective Actions", href: "/auditor/corrective-actions", icon: CheckSquare },
  { label: "Reports", href: "/auditor/reports", icon: BarChart3 },
  { label: "Notifications", href: "/auditor/notifications", icon: Bell },
  { label: "Help & Support", href: "/auditor/help", icon: HelpCircle },
];

export function AuditorSidebar() {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <aside className="w-64 flex-shrink-0 bg-slate-900 text-white flex flex-col h-screen sticky top-0">
      <div className="px-5 py-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center flex-shrink-0">
            <BadgeCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-white tracking-wider uppercase">Auditor</p>
            <p className="text-[10px] text-slate-400">Independent Audit & Assessment</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {nav.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || (href !== "/auditor/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-0.5",
                active
                  ? "bg-teal-600/20 text-teal-400 border border-teal-600/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-2 py-3 border-t border-slate-700">
        <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition w-full">
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
