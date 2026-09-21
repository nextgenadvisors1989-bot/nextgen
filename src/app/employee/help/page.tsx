"use client";

import { useEffect, useState, useCallback } from "react";
import { HelpCircle, Phone, Mail, User } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { LoadingState } from "@/components/ui/LoadingState";

interface EmployerContact {
  companyName: string; email: string; phone: string | null;
  contactPersonName: string | null; contactPersonPhone: string | null;
}

const FAQS = [
  { q: "How do I request a correction to my attendance?", a: "Go to Attendance, find the day in question, and click \"Raise Correction\". Your Employer/HR will review and approve or reject it." },
  { q: "Why can't I see my salary slip yet?", a: "Salary slips are generated only after your Employer finalizes payroll for that month. Check back after the payroll run is locked." },
  { q: "How do I update my address or bank details?", a: "Go to My Profile and edit the allowed fields directly. Changes to your name, department, or statutory numbers must go through your Employer or Admin." },
  { q: "I uploaded a document but it still shows Pending — what now?", a: "Documents are verified by your Employer (or Admin). If it's rejected, you'll see the reason on the Documents page and can re-upload." },
  { q: "How do I apply for leave?", a: "Go to Leave, choose your leave type and dates, and submit. Your Employer/Manager will approve or reject the request." },
];

export default function EmployeeHelpPage() {
  const [employer, setEmployer] = useState<EmployerContact | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/employee/help");
      const json = await res.json();
      if (res.ok && json.success) setEmployer(json.data.employer);
    } catch {
      // non-critical — FAQ still renders
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingState message="Loading support info..." />;

  return (
    <PageTemplate title="Help & Support" subtitle="Get in touch or find quick answers" icon={HelpCircle}>
      {employer && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5 max-w-lg">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Contact {employer.companyName} HR</h3>
          <div className="space-y-2">
            {employer.contactPersonName && (
              <p className="text-sm text-gray-700 flex items-center gap-2"><User className="w-4 h-4 text-gray-400" /> {employer.contactPersonName}</p>
            )}
            {(employer.contactPersonPhone || employer.phone) && (
              <a href={`tel:${employer.contactPersonPhone || employer.phone}`} className="text-sm text-blue-600 flex items-center gap-2 hover:underline">
                <Phone className="w-4 h-4" /> {employer.contactPersonPhone || employer.phone}
              </a>
            )}
            <a href={`mailto:${employer.email}`} className="text-sm text-blue-600 flex items-center gap-2 hover:underline">
              <Mail className="w-4 h-4" /> {employer.email}
            </a>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 max-w-2xl">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Frequently Asked Questions</h3>
        <div className="divide-y divide-gray-100">
          {FAQS.map((f) => (
            <details key={f.q} className="py-3 group">
              <summary className="text-sm font-medium text-gray-800 cursor-pointer list-none flex items-center justify-between">
                {f.q}
                <span className="text-gray-400 group-open:rotate-180 transition-transform">⌄</span>
              </summary>
              <p className="text-sm text-gray-500 mt-2">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </PageTemplate>
  );
}
