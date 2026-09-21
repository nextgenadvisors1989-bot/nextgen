"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Save, ArrowLeft } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import Link from "next/link";

interface Department { id: number; name: string; }
interface Designation { id: number; name: string; }

export default function NewEmployeePage() {
  const router = useRouter();
  const { success, error: showError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    dateOfBirth: "", gender: "", maritalStatus: "", fatherSpouseName: "",
    presentAddress: "", permanentAddress: "",
    employeeType: "regular", departmentId: "", designationId: "",
    joiningDate: "", confirmationDate: "", workLocation: "", weeklyOff: "sunday",
    workingHours: "8", pfNumber: "", uan: "", esiNumber: "",
    bankAccount: "", bankName: "", ifsc: "", panNumber: "",
    qualification: "", previousExperience: "",
  });

  useEffect(() => {
    fetch("/api/employer/departments").then(r => r.json()).then(d => { if (d.success) setDepartments(d.data.departments || []); }).catch(() => {});
    fetch("/api/employer/designations").then(r => r.json()).then(d => { if (d.success) setDesignations(d.data.designations || []); }).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        departmentId: form.departmentId ? parseInt(form.departmentId) : undefined,
        designationId: form.designationId ? parseInt(form.designationId) : undefined,
        workingHours: form.workingHours || undefined,
      };
      const res = await fetch("/api/employer/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || "Failed to create employee"); return; }
      success("Employee created successfully");
      router.push("/employer/employees");
    } catch { showError("Failed to create employee"); }
    finally { setSubmitting(false); }
  }

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500";
  const labelClass = "block text-xs font-medium text-gray-700 mb-1";

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/employer/employees" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="w-9 h-9 rounded-lg bg-purple-600 flex items-center justify-center">
          <UserPlus className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Register New Employee</h1>
          <p className="text-xs text-gray-500">Fill all required details to create employee record</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Personal Information */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Personal Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>First Name *</label><input required value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>Last Name</label><input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>Phone</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>Date of Birth</label><input type="date" value={form.dateOfBirth} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>Gender</label>
              <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} className={inputClass + " bg-white"}>
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div><label className={labelClass}>Marital Status</label>
              <select value={form.maritalStatus} onChange={e => setForm(f => ({ ...f, maritalStatus: e.target.value }))} className={inputClass + " bg-white"}>
                <option value="">Select</option>
                <option value="single">Single</option>
                <option value="married">Married</option>
                <option value="divorced">Divorced</option>
              </select>
            </div>
            <div><label className={labelClass}>Father / Spouse Name</label><input value={form.fatherSpouseName} onChange={e => setForm(f => ({ ...f, fatherSpouseName: e.target.value }))} className={inputClass} /></div>
            <div className="col-span-2"><label className={labelClass}>Present Address</label><textarea rows={2} value={form.presentAddress} onChange={e => setForm(f => ({ ...f, presentAddress: e.target.value }))} className={inputClass} /></div>
            <div className="col-span-2"><label className={labelClass}>Permanent Address</label><textarea rows={2} value={form.permanentAddress} onChange={e => setForm(f => ({ ...f, permanentAddress: e.target.value }))} className={inputClass} /></div>
          </div>
        </div>

        {/* Employment Details */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Employment Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Employee Type *</label>
              <select required value={form.employeeType} onChange={e => setForm(f => ({ ...f, employeeType: e.target.value }))} className={inputClass + " bg-white"}>
                <option value="regular">Regular</option>
                <option value="temporary">Temporary</option>
                <option value="contractor">Contractor</option>
              </select>
            </div>
            <div><label className={labelClass}>Department</label>
              <select value={form.departmentId} onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))} className={inputClass + " bg-white"}>
                <option value="">Select department</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Designation</label>
              <select value={form.designationId} onChange={e => setForm(f => ({ ...f, designationId: e.target.value }))} className={inputClass + " bg-white"}>
                <option value="">Select designation</option>
                {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Joining Date</label><input type="date" value={form.joiningDate} onChange={e => setForm(f => ({ ...f, joiningDate: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>Confirmation Date</label><input type="date" value={form.confirmationDate} onChange={e => setForm(f => ({ ...f, confirmationDate: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>Work Location</label><input value={form.workLocation} onChange={e => setForm(f => ({ ...f, workLocation: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>Weekly Off</label>
              <select value={form.weeklyOff} onChange={e => setForm(f => ({ ...f, weeklyOff: e.target.value }))} className={inputClass + " bg-white"}>
                <option value="sunday">Sunday</option>
                <option value="saturday">Saturday</option>
                <option value="saturday_sunday">Saturday & Sunday</option>
              </select>
            </div>
            <div><label className={labelClass}>Working Hours/Day</label><input type="number" value={form.workingHours} onChange={e => setForm(f => ({ ...f, workingHours: e.target.value }))} className={inputClass} /></div>
          </div>
        </div>

        {/* Statutory Details */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Statutory & Bank Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>PF Number</label><input value={form.pfNumber} onChange={e => setForm(f => ({ ...f, pfNumber: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>UAN</label><input value={form.uan} onChange={e => setForm(f => ({ ...f, uan: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>ESI Number</label><input value={form.esiNumber} onChange={e => setForm(f => ({ ...f, esiNumber: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>PAN Number</label><input value={form.panNumber} onChange={e => setForm(f => ({ ...f, panNumber: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>Bank Account</label><input value={form.bankAccount} onChange={e => setForm(f => ({ ...f, bankAccount: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>Bank Name</label><input value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>IFSC Code</label><input value={form.ifsc} onChange={e => setForm(f => ({ ...f, ifsc: e.target.value }))} className={inputClass} /></div>
            <div><label className={labelClass}>Qualification</label><input value={form.qualification} onChange={e => setForm(f => ({ ...f, qualification: e.target.value }))} className={inputClass} /></div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/employer/employees" className="px-5 py-2.5 border border-gray-300 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition">Cancel</Link>
          <button type="submit" disabled={submitting} className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition disabled:opacity-50">
            {submitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            Save Employee
          </button>
        </div>
      </form>
    </div>
  );
}
