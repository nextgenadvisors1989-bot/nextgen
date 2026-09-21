import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { EmployerSidebar } from "@/components/layout/EmployerSidebar";
import { ToastProvider } from "@/components/ui/Toast";

export default async function EmployerLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireRole(["employer_admin", "hr_manager", "super_admin", "admin"]);
  } catch {
    redirect("/login");
  }

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <EmployerSidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
