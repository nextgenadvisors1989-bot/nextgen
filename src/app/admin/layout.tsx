import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { ToastProvider } from "@/components/ui/Toast";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireRole(["super_admin", "admin"]);
  } catch {
    redirect("/login");
  }

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <AdminSidebar />
        <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
