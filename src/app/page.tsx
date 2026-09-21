import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  // Redirect based on role
  switch (user.role) {
    case "super_admin":
    case "admin":
      redirect("/admin/dashboard");
    case "auditor":
      redirect("/auditor/dashboard");
    case "employer_admin":
    case "hr_manager":
      redirect("/employer/dashboard");
    case "employee":
      redirect("/employee/dashboard");
    default:
      redirect("/login");
  }
}
