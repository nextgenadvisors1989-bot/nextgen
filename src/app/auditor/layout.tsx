import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { AuditorSidebar } from "@/components/layout/AuditorSidebar";
import { ToastProvider } from "@/components/ui/Toast";

export default async function AuditorLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireRole(["auditor", "super_admin", "admin"]);
  } catch {
    redirect("/login");
  }

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <AuditorSidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
