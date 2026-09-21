import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { EmployeeSidebar } from "@/components/layout/EmployeeSidebar";
import { ToastProvider } from "@/components/ui/Toast";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireRole(["employee", "super_admin", "admin"]);
  } catch {
    redirect("/login");
  }

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <EmployeeSidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
