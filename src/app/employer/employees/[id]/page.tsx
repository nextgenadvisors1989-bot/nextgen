"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Edit2, Save, UserRound } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

interface Employee {
  id: number;
  employeeNumber: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  maritalStatus: string | null;
  fatherSpouseName: string | null;
  presentAddress: string | null;
  permanentAddress: string | null;
  emergencyContact: string | null;
  employeeType: string;
  joiningDate: string | null;
  confirmationDate: string | null;
  workLocation: string | null;
  weeklyOff: string | null;
  pfNumber: string | null;
  uan: string | null;
  esiNumber: string | null;
  bankAccount: string | null;
  bankName: string | null;
  ifsc: string | null;
  panNumber: string | null;
  qualification: string | null;
  status: string;
  deptName: string | null;
  desigName: string | null;
}

type EditableField = "firstName" | "lastName" | "email" | "phone" | "employeeType" | "joiningDate" | "workLocation" | "status";

const editableFields: { key: EditableField; label: string; type?: string }[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone" },
  { key: "employeeType", label: "Employee type" },
  { key: "joiningDate", label: "Joining date", type: "date" },
  { key: "workLocation", label: "Work location" },
  { key: "status", label: "Status" },
];

export function EmployerEmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { success, error: showError } = useToast();
  const isEditing = pathname.endsWith("/edit");
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<Partial<Record<EditableField, string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadEmployee() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/employer/employees/${params.id}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to load employee");
      const record = data.data.employee as Employee;
      setEmployee(record);
      setForm({
        firstName: record.firstName || "",
        lastName: record.lastName || "",
        email: record.email || "",
        phone: record.phone || "",
        employeeType: record.employeeType || "regular",
        joiningDate: record.joiningDate || "",
        workLocation: record.workLocation || "",
        status: record.status || "active",
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load employee");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (params.id) loadEmployee();
  }, [params.id]);

  async function saveEmployee(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(`/api/employer/employees/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to update employee");
      success("Employee updated");
      router.push(`/employer/employees/${params.id}`);
      await loadEmployee();
    } catch (saveError) {
      showError(saveError instanceof Error ? saveError.message : "Unable to update employee");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState message="Loading employee..." />;
  if (error || !employee) return <ErrorState message={error || "Employee not found"} onRetry={loadEmployee} />;

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/employer/employees" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Back to employees">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-10 h-10 rounded-lg bg-purple-600 flex items-center justify-center">
            <UserRound className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">{employee.firstName} {employee.lastName || ""}</h1>
            <p className="text-xs text-gray-500">{employee.employeeNumber || "Employee profile"}</p>
          </div>
        </div>
        {!isEditing && (
          <Link href={`/employer/employees/${employee.id}/edit`} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
            <Edit2 className="w-4 h-4" /> Edit employee
          </Link>
        )}
      </div>

      {isEditing ? (
        <form onSubmit={saveEmployee} className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
          <h2 className="font-semibold text-gray-900">Edit employee details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {editableFields.map(({ key, label, type }) => (
              <label key={key} className="text-sm text-gray-700">
                <span className="block font-medium mb-1">{label}</span>
                {key === "employeeType" || key === "status" ? (
                  <select value={form[key] || ""} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2">
                    {(key === "employeeType" ? ["regular", "temporary", "contractor"] : ["active", "pending", "suspended", "inactive"]).map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : (
                  <input type={type || "text"} value={form[key] || ""} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                )}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-3">
            <Link href={`/employer/employees/${employee.id}`} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg">Cancel</Link>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-purple-600 rounded-lg disabled:opacity-60">
              <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-5">
            <div><p className="text-xs text-gray-500">Status</p><StatusBadge status={employee.status} /></div>
            <div><p className="text-xs text-gray-500">Employee type</p><p className="text-sm capitalize text-gray-800">{employee.employeeType}</p></div>
            <div><p className="text-xs text-gray-500">Joining date</p><p className="text-sm text-gray-800">{formatDate(employee.joiningDate)}</p></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
            {[
              ["Email", employee.email], ["Phone", employee.phone], ["Department", employee.deptName], ["Designation", employee.desigName],
              ["Work location", employee.workLocation], ["Qualification", employee.qualification], ["PAN number", employee.panNumber], ["UAN", employee.uan],
              ["PF number", employee.pfNumber], ["ESI number", employee.esiNumber], ["Bank", employee.bankName], ["IFSC", employee.ifsc],
              ["Present address", employee.presentAddress], ["Permanent address", employee.permanentAddress], ["Emergency contact", employee.emergencyContact],
            ].map(([label, value]) => <div key={label}><p className="text-xs text-gray-500">{label}</p><p className="text-sm text-gray-800 mt-1">{value || "-"}</p></div>)}
          </div>
        </div>
      )}
    </div>
  );
}

export default EmployerEmployeeDetailPage;
